const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const {
  createPublicClient,
  http,
  encodeFunctionData,
  getAddress,
  pad,
} = require("viem");
const {
  initiateDeveloperControlledWalletsClient,
} = require("@circle-fin/developer-controlled-wallets");
const config = require("../config/index.js");
const networkService = require("./networkService");
const CCTP = require("../config/cctp.js");
const forge = require("node-forge");

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
      if (!this.walletSDK) {
        console.log("Initializing Circle Wallet SDK...");

        this.walletSDK = await initiateDeveloperControlledWalletsClient({
          apiKey: config.circle.apiKey,
          entitySecret: config.circle.entitySecret,
        });

        console.log("Circle Wallet SDK initialized");
      }
      return this.walletSDK;
    } catch (error) {
      console.error("Error initializing Circle SDK:", error);
      throw new Error("Failed to initialize Circle SDK: " + error.message);
    }
  }

  async generateEntitySecretCiphertext() {
    try {
      // Convert entity secret from hex to bytes
      const entitySecret = forge.util.hexToBytes(config.circle.entitySecret);

      const response = await this.walletSDK.getPublicKey();
      console.log("response", response.data.publicKey);

      // Convert PEM string to a public key
      const publicKey = forge.pki.publicKeyFromPem(response.data.publicKey);
      console.log("publicKey", publicKey);

      // Encrypt using RSA-OAEP with SHA-256
      const encryptedData = publicKey.encrypt(entitySecret, "RSA-OAEP", {
        md: forge.md.sha256.create(),
        mgf1: { md: forge.md.sha256.create() },
      });

      // Convert encrypted data to Base64 (as required by Circle API)
      return forge.util.encode64(encryptedData);
    } catch (error) {
      console.error("Error encrypting entity secret:", error);
      throw error;
    }
  }

  async createWallet(userId) {
    try {
      const walletSetResponse = await this.walletSDK.createWalletSet({
        name: "WalletSet 1",
      });

      // const currentNetwork = networkService.getCurrentNetwork();

      // const accountType = currentNetwork.name.startsWith("AVAX")
      //   ? "EOA"
      //   : "SCA";

      const walletData = await this.walletSDK.createWallets({
        // idempotencyKey: uuidv4(),
        blockchains: ["EVM-TESTNET"],
        accountType: "EOA",
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
      await this.init();
      const currentNetwork = networkService.getCurrentNetwork();

      const usdcAmount = BigInt(amount) * BigInt(10 ** 6);

      const sourceClient = createPublicClient({
        transport: http(CCTP.rpc[currentNetwork.name]),
      });
      const sourceConfig = CCTP.contracts[currentNetwork.name];

      // 1. Approve USDC transfer
      await this.bot.sendMessage(
        chatId,
        "Step 1/4: Approving USDC transfer...",
      );

      const approveData = encodeFunctionData({
        abi: CCTP.abis.usdc,
        functionName: "approve",
        args: [sourceConfig.tokenMessenger, usdcAmount],
      });

      // Estimate gas correctly
      const estimateGas = await sourceClient.estimateGas({
        account: walletAddress,
        to: sourceConfig.usdc,
        value: 0n,
        data: approveData,
      });

      console.log("estimated gas is", estimateGas);

      // Fetch gas parameters
      const gasPrice = await sourceClient.getGasPrice();
      const maxPriorityFeePerGas =
        await sourceClient.estimateMaxPriorityFeePerGas();
      const chainId = await sourceClient.getChainId();
      const nonce = await sourceClient.getTransactionCount({
        address: walletAddress,
      });
      // Build transaction

      const approveTx = {
        nonce: Number(nonce),
        to: sourceConfig.usdc,
        value: "0",
        gas: estimateGas.toString(),
        maxFeePerGas: gasPrice.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
        chainId: Number(chainId),
        data: approveData,
      };

      const entitySecretCiphertext =
        await this.generateEntitySecretCiphertext();

      const signedApproveTx = await axios.post(
        "https://api.circle.com/v1/w3s/developer/sign/transaction",
        {
          entitySecretCiphertext: entitySecretCiphertext,
          walletId: walletId,
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
        `✅ Approval transaction submitted: ${signedApproveTx.data.data.txHash}`,
      );

      // 2. Create burn transaction
      await this.bot.sendMessage(chatId, "Step 2/4: Initiating USDC burn...");

      const maxPriorityFeePerGasBurn =
        await sourceClient.estimateMaxPriorityFeePerGas();

      const mintRecipientAddressInBytes32 = pad(
        getAddress(destinationAddress),
        { size: 32 },
      );

      const maxFee = usdcAmount / BigInt(5000);

      console.log("usdcamount", usdcAmount);
      console.log("destination domain", CCTP.domains[destinationNetwork]);
      console.log("mintreceipient", mintRecipientAddressInBytes32);
      console.log("burnToken", sourceConfig.usdc);
      console.log(
        "destinationCaller",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
      console.log("maxFee", maxFee);
      console.log("minFinalityThreshold", 1000);

      const burnData = encodeFunctionData({
        abi: CCTP.abis.tokenMessenger,
        functionName: "depositForBurn",
        args: [
          usdcAmount,
          CCTP.domains[destinationNetwork],
          mintRecipientAddressInBytes32,
          sourceConfig.usdc,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          maxFee,
          1000,
        ],
      });

      // // Estimate gas correctly
      // const estimateGasBurn = await sourceClient.estimateGas({
      //   account: walletAddress,
      //   to: sourceConfig.tokenMessenger,
      //   value: 0n,
      //   data: burnData,
      // });

      // console.log("estimategasburn", estimateGasBurn);

      // Fetch gas parameters
      const gasPriceBurn = await sourceClient.getGasPrice();
      const nonceBurn = await sourceClient.getTransactionCount({
        address: walletAddress,
      });

      // Build transaction

      const burnTx = {
        nonce: Number(nonceBurn),
        to: sourceConfig.usdc,
        value: "0",
        gas: estimateGas.toString(),
        maxFeePerGas: gasPriceBurn.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGasBurn.toString(),
        chainId: Number(chainId),
        data: burnData,
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
        `✅ Burn transaction submitted: ${signedBurnTx.data.data.txHash}`,
      );

      // 3. Get attestation
      await this.bot.sendMessage(
        chatId,
        "Step 3/4: Waiting for attestation...",
      );
      const srcDomainId = CCTP.domains[currentNetwork.name];
      const attestation = await this.waitForAttestation(
        srcDomainId,
        signedBurnTx.data.txHash,
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

      const receiveData = encodeFunctionData({
        abi: CCTP.abis.messageTransmitter,
        functionName: "receiveMessage",
        args: [attestation.message, attestation.attestation],
      });

      // Estimate gas correctly
      const estimateGasReceive = await destinationClient.estimateGas({
        account: walletAddress,
        to: destinationConfig.messageTransmitter,
        value: 0n,
        data: receiveData,
      });

      // Fetch gas parameters
      const gasPriceReceive = await destinationClient.getGasPrice();
      const maxPriorityFeePerGasReceieve =
        await destinationClient.estimateMaxPriorityFeePerGas();
      const chainIdReceive = await destinationClient.getChainId();
      const nonceReceive = await destinationClient.getTransactionCount({
        address: walletAddress,
      });
      // Build transaction

      const receiveTx = {
        nonce: Number(nonceReceive),
        to: destinationConfig.usdc,
        value: "0",
        gas: estimateGasReceive.toString(),
        maxFeePerGas: gasPriceReceive.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGasReceieve.toString(),
        chainId: Number(chainIdReceive),
        data: approveData,
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
        approveTx: signedApproveTx.data.data.txHash,
        burnTx: signedBurnTx.data.data.txHash,
        receiveTx: signedReceiveTx.data.data.txHash,
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
