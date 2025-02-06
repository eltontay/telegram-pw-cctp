const {
  initiateDeveloperControlledWalletsClient,
} = require("@circle-fin/developer-controlled-wallets");
const {
  SmartContractPlatformSDK,
} = require("@circle-fin/smart-contract-platform");
const { v4: uuidv4 } = require("uuid");
const config = require("../config/index.js");
const networkService = require("./networkService");

async function getBalance(walletId, networkName) {
  const network = networkService.setNetwork(networkName);
  const client = await initiateDeveloperControlledWalletsClient({
    apiKey: config.circle.apiKey,
    entitySecret: config.circle.entitySecret,
  });

  return await client.getTokenBalance({
    walletId,
    tokenId: network.usdcTokenId,
  });
}
const axios = require("axios");

class CircleService {
  constructor() {
    this.config = config;
    this.walletSDK = initiateDeveloperControlledWalletsClient({
      apiKey: config.circle.apiKey,
      entitySecret: config.circle.entitySecret,
    });
  }

  async init() {
    this.walletSDK = await initiateDeveloperControlledWalletsClient({
      apiKey: config.circle.apiKey,
      entitySecret: config.circle.entitySecret,
    });
  }

  async createWallet(userId) {
    try {
      const walletSetResponse = await this.walletSDK.createWalletSet({
        name: "WalletSet 1",
      });

      const networkService = require('./networkService');
      const currentNetwork = networkService.getCurrentNetwork();
      
      const accountType = currentNetwork.name.startsWith('AVAX') ? 'EOA' : 'SCA';
      
      const walletData = await this.walletSDK.createWallets({
        idempotencyKey: uuidv4(),
        blockchains: [currentNetwork.name],
        accountType: accountType,
        walletSetId: walletSetResponse.data?.walletSet?.id ?? "",
      });
      const walletId = walletData.data.wallets[0].id;
      return { walletId, walletData };
    } catch (error) {
      console.error("Error creating wallet:", error);
      throw error;
    }
  }

  async getWalletBalance(walletId, networkName) {
    try {
      const networkService = require('./networkService');
      const network = networkService.getCurrentNetwork();

      const response = await axios.get(
        `https://api.circle.com/v1/w3s/wallets/${walletId}/balances`,
        {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
          },
        },
      );

      const balances = response.data.data.tokenBalances;

      // Filter and format balances for the specific network
      const usdcBalance =
        balances.find((b) => b.token.id === network.usdcTokenId)
          ?.amount || "0";

      return {
        usdc: usdcBalance,
        network: network.name
      };
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      throw error;
    }
  }

  async sendTransaction(walletId, destinationAddress, amount) {
    try {
      const response = await this.walletSDK.createTransaction({
        walletId: walletId,
        tokenId: config.network.usdcTokenId,
        destinationAddress: destinationAddress,
        amounts: [amount],
        fee: {
          type: "level",
          config: {
            feeLevel: "LOW",
          },
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error sending transaction:", error);
      throw error;
    }
  }

  async getWalletId(address) {
    try {
      const response = await axios.get(
        `https://api.circle.com/v1/w3s/wallets?address=${address}`,
        {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
          },
        }
      );
      return response.data.data.wallets[0]?.id;
    } catch (error) {
      console.error("Error retrieving wallet ID:", error);
      throw error;
    }
  }

  async crossChainTransfer(walletId, sourceNetwork, destinationNetwork, destinationAddress, amount) {
    try {
      await this.init();
      const CCTP = require('../config/cctp');
      const networkService = require('./networkService');
      
      if (!CCTP.contracts[sourceNetwork] || !CCTP.contracts[destinationNetwork]) {
        throw new Error('Invalid network configuration');
      }
      
      // 1. Approve USDC transfer
      const approveTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        tokenId: config.network.usdcTokenId,
        type: 'approve',
        destinationAddress: CCTP.contracts[sourceNetwork].tokenMessenger,
        amounts: [amount]
      });
      
      // 2. Wait for approval
      await this.walletSDK.waitForTransaction(approveTx.data.transaction.id);

      // 3. Create burn transaction
      const destinationDomain = CCTP.domains[destinationNetwork];
      const burnTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        type: 'contract_call',
        destinationAddress: CCTP.contracts[sourceNetwork].tokenMessenger,
        contractAbi: ['function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint256 minFinalityThreshold)'],
        functionName: 'depositForBurn',
        functionArgs: [
          amount,
          destinationDomain,
          `0x${destinationAddress.padStart(64, '0')}`,
          config.network.usdcAddress,
          '0x' + '0'.repeat(64),
          '0',
          '1000'
        ]
      });

      // 4. Wait for burn transaction
      const burnReceipt = await this.walletSDK.waitForTransaction(burnTx.data.transaction.id);

      // 5. Get attestation
      const attestation = await this.waitForAttestation(
        CCTP.domains[sourceNetwork],
        burnReceipt.transactionHash
      );

      // 6. Receive on destination chain
      const receiveTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        type: 'contract_call',
        destinationAddress: CCTP.contracts[destinationNetwork].messageTransmitter,
        contractAbi: ['function receiveMessage(bytes message, bytes attestation)'],
        functionName: 'receiveMessage',
        functionArgs: [attestation.message, attestation.attestation]
      });

      return {
        approveTx: approveTx.data.transaction.id,
        burnTx: burnTx.data.transaction.id,
        receiveTx: receiveTx.data.transaction.id
      };
    } catch (error) {
      console.error("Error in cross-chain transfer:", error);
      throw error;
    }
  }

  async waitForAttestation(srcDomainId, transactionHash) {
    try {
      while (true) {
        const response = await axios.get(
          `https://api.circle.com/v2/messages/${srcDomainId}?transactionHash=${transactionHash}`,
          {
            headers: {
              Authorization: `Bearer ${config.circle.apiKey}`,
            },
          }
        );
        
        if (response.data?.messages?.length > 0 && response.data.messages[0].status === "complete") {
          return {
            message: response.data.messages[0].message,
            attestation: response.data.messages[0].attestation
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error("Error getting attestation:", error);
      throw error;
    }
  }
}

module.exports = new CircleService();