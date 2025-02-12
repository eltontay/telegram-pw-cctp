const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { createPublicClient, http } = require("viem");
const {
  initiateDeveloperControlledWalletsClient,
} = require("@circle-fin/developer-controlled-wallets");
const config = require("../config/index.js");
const networkService = require("./networkService");
const CCTP = require("../config/cctp.js");

class CircleService {
  constructor(bot) {
    try {
      if (!config?.circle?.apiKey || !config?.circle?.entitySecret) {
        throw new Error("Circle API key or entity secret is missing");
      }
      this.walletSDK = null;
      this.bot = bot;
    } catch (error) {
      console.error("CircleService initialization error:", error);
      throw new Error("Failed to initialize CircleService: " + error.message);
    }
  }

  async init() {
    try {
      if (!this.walletSDK && config.circle) {
        this.walletSDK = await initiateDeveloperControlledWalletsClient({
          apiKey: config.circle.apiKey,
          entitySecret: config.circle.entitySecret,
        });
      }
      if (!this.walletSDK) {
        throw new Error("Failed to initialize Circle SDK");
      }
      return this.walletSDK;
    } catch (error) {
      console.error("Error initializing Circle SDK:", error);
      throw error;
    }
  }

  async createWallet(userId) {
    try {
      const walletSetResponse = await this.walletSDK.createWalletSet({
        name: "WalletSet 1",
      });

      const currentNetwork = networkService.getCurrentNetwork();

      const accountType = currentNetwork.name.startsWith("AVAX")
        ? "EOA"
        : "SCA";

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

  async getWalletBalance(walletId) {
    try {
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

      const networkTokenId = network.usdcTokenId;
      console.log("Checking balance for token ID:", networkTokenId);
      console.log("Available balances:", balances);

      const usdcBalance =
        balances.find((b) => b.token.id === networkTokenId)?.amount || "0";

      return {
        usdc: usdcBalance,
        network: network.name,
      };
    } catch (error) {
      console.error("Error getting wallet balance:", error);
      throw error;
    }
  }

  async sendTransaction(walletId, destinationAddress, amount) {
    try {
      await this.init();
      const network = networkService.getCurrentNetwork();
      const response = await this.walletSDK.createTransaction({
        walletId: walletId,
        tokenId: network.usdcTokenId,
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
        },
      );
      return response.data.data.wallets[0]?.id;
    } catch (error) {
      console.error("Error retrieving wallet ID:", error);
      throw error;
    }
  }

  async crossChainTransfer(
    walletId,
    walletAddress,
    destinationNetwork,
    destinationAddress,
    amount,
    chatId,
  ) {
    try {
      const currentNetwork = networkService.getCurrentNetwork();

      // Validate networks
      if (
        !CCTP.contracts[currentNetwork.name] ||
        !CCTP.contracts[destinationNetwork]
      ) {
        throw new Error(
          `Invalid network. Supported networks: ${Object.keys(CCTP.domains).join(", ")}`,
        );
      }

      if (currentNetwork.name === destinationNetwork) {
        throw new Error("Source and destination networks cannot be the same");
      }

      const sourceClient = createPublicClient({
        transport: http(CCTP.rpc[currentNetwork.name]),
      });
      const sourceConfig = CCTP.contracts[currentNetwork.name];

      // 1. Approve USDC transfer
      await this.bot.sendMessage(
        chatId,
        "Step 1/4: Approving USDC transfer...",
      );

      // Get transaction parameters using viem
      const nonce = await sourceClient.getTransactionCount({ address: walletAddress });
      const encodedApproveData = {
        data: `0x095ea7b3${sourceConfig.tokenMessenger.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`,
        to: sourceConfig.usdc,
        value: '0x0'
      };
      const estimateGas = await sourceClient.estimateGas({
        account: walletAddress,
        to: sourceConfig.usdc,
        value: 0n,
        data: encodedApproveData
      });
      const gasPrice = await sourceClient.getGasPrice();
      const maxPriorityFeePerGasApprove =
        await sourceClient.estimateMaxPriorityFeePerGas();
      const chainId = await sourceClient.getChainId();

      const approveTx = {
        nonce: nonce.toString(),
        to: sourceConfig.usdc,
        value: 0n,
        gas: estimateGas.toString(),
        maxFeePerGas: gasPrice.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGasApprove.toString(),
        chainId: chainId,
        data: encodedApproveData,
      };

      const signedApproveTx = await axios.post(
        "https://api.circle.com/v1/w3s/developer/sign/transaction",
        {
          walletId,
          transaction: JSON.stringify(approveTx),
        },
        {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Approval transaction submitted: ${signedApproveTx.data.transactionId}`,
      );

      // 2. Create burn transaction
      await this.bot.sendMessage(chatId, "Step 2/4: Initiating USDC burn...");
      const maxPriorityFeePerGasBurn =
        await publicClient.estimateMaxPriorityFeePerGas();
      const burnNonce = await sourceClient.getTransactionCount({
        address: walletAddress,
      });
      const burnEstimateGas = await sourceClient.estimateGas({
        account: walletAddress,
        to: sourceConfig.tokenMessenger,
        data: burnTx.encodeFunctionData({
          abi: CCTP.abis.tokenMessenger,
          functionName: "depositForBurn",
          args: [
            amount,
            CCTP.domains[destinationNetwork],
            destinationAddress,
            sourceConfig.usdc,
            maxPriorityFeePerGas.toString(),
            1000,
          ],
        }),
      });

      const burnTx = {
        nonce: burnNonce.toString(),
        to: sourceConfig.tokenMessenger,
        value: "0",
        gas: burnEstimateGas.toString(),
        maxFeePerGas: gasPrice.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGasBurn.toString(),
        chainId: chainId,
        data: burnTx.encodeFunctionData({
          abi: CCTP.abis.tokenMessenger,
          functionName: "depositForBurn",
          args: [
            amount,
            CCTP.domains[destinationNetwork],
            destinationAddress,
            sourceConfig.usdc,
            maxPriorityFeePerGas.toString(),
            1000,
          ],
        }),
      };

      const signedBurnTx = await axios.post(
        "https://api.circle.com/v1/w3s/developer/sign/transaction",
        {
          walletId,
          transaction: JSON.stringify(burnTx),
        },
        {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Burn transaction submitted: ${signedBurnTx.data.transactionId}`,
      );

      // 3. Get attestation
      await this.bot.sendMessage(
        chatId,
        "Step 3/4: Waiting for attestation...",
      );
      const srcDomainId = CCTP.domains[currentNetwork.name];
      const attestation = await this.waitForAttestation(
        srcDomainId,
        signedBurnTx.data.transactionId,
      );
      await this.bot.sendMessage(chatId, "✅ Attestation received!");

      // 4. Receive on destination chain
      await this.bot.sendMessage(
        chatId,
        "Step 4/4: Finalizing transfer on destination chain...",
      );
      const destinationConfig = CCTP.contracts[destinationNetwork];

      const destinationClient = createPublicClient({
        transport: http(CCTP.rpc[destinationNetwork]),
      });

      const receiveNonce = await destinationClient.getTransactionCount({
        address: walletAddress,
      });
      const receiveEstimateGas = await destinationClient.estimateGas({
        account: walletAddress,
        to: destinationConfig.messageTransmitter,
        data: receiveTx.encodeFunctionData({
          abi: CCTP.abis.messageTransmitter,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
        }),
      });
      const receiveGasPrice = await destinationClient.getGasPrice();
      const receiveMaxPriorityFeePerGas =
        await destinationClient.estimateMaxPriorityFeePerGas();
      const receiveChainId = await destinationClient.getChainId();

      const receiveTx = {
        nonce: receiveNonce.toString(),
        to: destinationConfig.messageTransmitter,
        value: "0",
        gas: receiveEstimateGas.toString(),
        maxFeePerGas: receiveGasPrice.toString(),
        maxPriorityFeePerGas: receiveMaxPriorityFeePerGas.toString(),
        chainId: receiveChainId,
        data: receiveTx.encodeFunctionData({
          abi: CCTP.abis.messageTransmitter,
          functionName: "receiveMessage",
          args: [attestation.message, attestation.attestation],
        }),
      };

      const signedReceiveTx = await axios.post(
        "https://api.circle.com/v1/w3s/developer/sign/transaction",
        {
          walletId,
          transaction: JSON.stringify(receiveTx),
        },
        {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      return {
        approveTx: signedApproveTx.data.transactionId,
        burnTx: signedBurnTx.data.transactionId,
        receiveTx: signedReceiveTx.data.transactionId,
      };
    } catch (error) {
      console.error("Error in cross-chain transfer:", error);
      throw error;
    }
  }

  async waitForAttestation(srcDomainId, transactionHash) {
    console.log(`Checking attestation for:
    Source Domain ID: ${srcDomainId}
    Transaction Hash: ${transactionHash}
    `);
    const url = `https://api.circle.com/v2/messages/${srcDomainId}`;
    try {
      while (true) {
        const response = await fetch(
          `${url}?transactionHash=${transactionHash}`,
          {
            headers: {
              Authorization: `Bearer ${config.circle.apiKey}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const attestationResponse = await response.json();
        if (
          attestationResponse?.messages?.length > 0 &&
          attestationResponse.messages[0].status === "complete"
        ) {
          const { message, attestation } = attestationResponse.messages[0];
          console.log(`Message attested ${url}`);
          return { message, attestation };
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to get attestation: ${error}`);
      throw error;
    }
  }
}

module.exports = CircleService;