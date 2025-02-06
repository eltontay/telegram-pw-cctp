const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
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
    sourceNetwork,
    destinationNetwork,
    destinationAddress,
    amount,
    chatId,
  ) {
    try {
      // Initialize SDK first
      await this.init();

      // Validate networks
      const currentNetwork = networkService.getCurrentNetwork();

      if (!CCTP.contracts[currentNetwork.name]) {
        throw new Error(
          `Invalid source network: ${currentNetwork.name}. Supported networks for CCTP: ${Object.keys(CCTP.domains).join(", ")}`,
        );
      }

      if (!CCTP.contracts[destinationNetwork]) {
        throw new Error(
          `Invalid destination network: ${destinationNetwork}. Supported networks for CCTP: ${Object.keys(CCTP.domains).join(", ")}`,
        );
      }

      if (currentNetwork.name === destinationNetwork) {
        throw new Error("Source and destination networks cannot be the same");
      }

      // 1. Approve USDC transfer
      await this.bot.sendMessage(
        chatId,
        "Step 1/4: Approving USDC transfer...",
      );
      const networks = require("../../data/networks.json");
      const sourceNetworkConfig = networks[currentNetwork.name];

      // Debug logging
      console.log("Transaction Parameters:");
      console.log("walletId:", walletId);
      console.log("sourceNetworkConfig:", sourceNetworkConfig);
      console.log("tokenId:", sourceNetworkConfig?.usdcTokenId);
      console.log("currentNetwork:", currentNetwork);
      console.log("CCTP contracts:", CCTP.contracts);
      console.log(
        "tokenMessenger address:",
        CCTP.contracts[currentNetwork.name]?.tokenMessenger,
      );
      console.log("amount:", amount);

      if (!walletId) throw new Error("walletId is undefined");
      if (!sourceNetworkConfig?.usdcTokenId)
        throw new Error("usdcTokenId is undefined");
      if (!CCTP.contracts[currentNetwork.name]?.tokenMessenger)
        throw new Error("tokenMessenger address is undefined");
      if (!amount) throw new Error("amount is undefined");

      const approveTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        tokenId: sourceNetworkConfig.usdcTokenId,
        type: "approve",
        destinationAddress: CCTP.contracts[currentNetwork.name].tokenMessenger,
        amounts: [amount],
        fee: {
          type: "level",
          config: {
            feeLevel: "HIGH",
          },
        },
      });
      console.log("Approve Transaction Response:", approveTx);

      const transactionId =
        approveTx?.data?.transaction?.id || approveTx?.data?.id;
      if (!transactionId) {
        throw new Error("Failed to get transaction ID from response");
      }

      await this.bot.sendMessage(
        chatId,
        `✅ Approval transaction submitted: ${transactionId}`,
      );

      // Create burn transaction
      await this.bot.sendMessage(chatId, "Step 3/4: Initiating USDC burn...");
      const destinationDomain = CCTP.domains[destinationNetwork];
      const burnTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        tokenId: sourceNetworkConfig.usdcTokenId,
        type: "depositForBurn",
        destinationAddress: CCTP.contracts[currentNetwork.name].tokenMessenger,
        amounts: [amount],
        destinationDomain: destinationDomain,
        mintRecipient: `0x${destinationAddress.padStart(64, "0")}`,
        burnToken: networks[currentNetwork.name].usdcAddress,
        fee: {
          type: "level",
          config: {
            feeLevel: "HIGH",
          },
        },
      });

      const burnTransactionId =
        burnTx?.data?.transaction?.id || burnTx?.data?.id;
      if (!burnTransactionId) {
        throw new Error("Failed to get burn transaction ID from response");
      }

      await this.bot.sendMessage(
        chatId,
        `✅ Burn transaction submitted: ${burnTransactionId}`,
      );

      // 5. Get attestation
      await this.bot.sendMessage(
        chatId,
        "Step 4/4: Waiting for attestation...",
      );
      const srcDomainId = CCTP.domains[currentNetwork.name];
      const attestation = await this.waitForAttestation(
        srcDomainId,
        burnTransactionId
      );
      await this.bot.sendMessage(chatId, "✅ Attestation received!");

      // 6. Receive on destination chain
      await this.bot.sendMessage(
        chatId,
        "Finalizing transfer on destination chain...",
      );
      const receiveTx = await this.walletSDK.createTransaction({
        walletId: walletId,
        type: "contract_call",
        destinationAddress:
          CCTP.contracts[destinationNetwork].messageTransmitter,
        contractAbi: [
          "function receiveMessage(bytes message, bytes attestation)",
        ],
        functionName: "receiveMessage",
        functionArgs: [attestation.message, attestation.attestation],
      });

      return {
        approveTx: approveTx.data.transaction.id,
        burnTx: burnTx.data.transaction.id,
        receiveTx: receiveTx.data.transaction.id,
      };
    } catch (error) {
      console.error("Error in cross-chain transfer:", error);
      throw error;
    }
  }

  async waitForAttestation(srcDomainId, transactionHash) {
    const startTime = Date.now();
    const url = `https://api.circle.com/v2/messages/${srcDomainId}?transactionHash=${transactionHash}`;
    console.log('Starting attestation check:', url);
    console.log('Source Domain ID:', srcDomainId);
    console.log('Transaction Hash:', transactionHash);

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const maxAttempts = 30; // 5 minutes maximum
    let attempt = 1;

    while (attempt <= maxAttempts) {
      try {
        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${config.circle.apiKey}`,
          },
        });

        if (response.data?.messages?.[0]) {
          const { message, attestation, status } = response.data.messages[0];
          console.log(`Attempt ${attempt}: Message Status:`, status);
          
          if (status === 'complete') {
            const totalTime = (Date.now() - startTime) / 1000;
            console.log(`Attestation completed in ${totalTime} seconds`);
            return { message, attestation };
          }
        }

        console.log(`Attempt ${attempt}/${maxAttempts}: Waiting 10 seconds...`);
        await sleep(10000);
        attempt++;
      } catch (error) {
        console.error(`Attempt ${attempt}/${maxAttempts} failed:`, error.response?.data || error.message);
        if (attempt === maxAttempts) throw error;
        await sleep(10000);
        attempt++;
      }
    }

    throw new Error('Attestation polling timed out after 5 minutes');
  }
}

module.exports = CircleService;