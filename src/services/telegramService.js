const TelegramBot = require("node-telegram-bot-api");
const config = require("../config/index.js");
const circleService = require("./circleService");
const storageService = require("./storageService");
const networkService = require("./networkService");
const CCTP = require("../config/cctp.js");

class TelegramService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: true });
    this.setupCommands();
  }

  setupCommands() {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/createWallet/, this.handleCreateWallet.bind(this));
    this.bot.onText(/\/balance/, this.handleBalance.bind(this));
    this.bot.onText(/\/send (.+)/, this.handleSend.bind(this));
    this.bot.onText(/\/address/, this.handleAddress.bind(this));
    this.bot.onText(/\/walletId/, this.handleWalletId.bind(this));
    this.bot.onText(/\/network (.+)/, this.handleNetwork.bind(this));
    this.bot.onText(/\/networks/, this.handleListNetworks.bind(this));
    this.bot.onText(/\/cctp (.+)/, this.handleCCTP.bind(this));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const message = `Welcome to Circle Wallet Bot!\n\nCommands:\n/createWallet - Create a wallet\n/address - Get wallet address\n/walletId - Get wallet ID\n/balance - Check USDC balance\n/send <address> <amount> - Send USDC\n/network <network> - Switch network\n/networks - List available networks\n/cctp <destination-network> <address> <amount> - Cross-chain transfer`;
    await this.bot.sendMessage(chatId, message);
  }

  async handleNetwork(msg, match) {
    const chatId = msg.chat.id;
    const networkName = match[1].toUpperCase();

    try {
      const networkService = require("./networkService");
      const network = networkService.setNetwork(networkName);
      await this.bot.sendMessage(
        chatId,
        `Switched to network: ${network.name} ${network.isTestnet ? "(Testnet)" : ""}\nUSDC Address: ${network.usdcAddress}`,
      );
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        `Error: Invalid network. Use /networks to see available networks.`,
      );
    }
  }

  async handleListNetworks(msg) {
    const chatId = msg.chat.id;
    const networkService = require("./networkService");
    const networks = networkService.getAllNetworks();

    const networksMessage = Object.entries(networks)
      .map(
        ([key, network]) =>
          `${network.name} ${network.isTestnet ? "(Testnet)" : ""}`,
      )
      .join("\n");

    await this.bot.sendMessage(
      chatId,
      `Available networks:\n${networksMessage}\n\nUse /network <name> to switch networks`,
    );
  }

  async handleCreateWallet(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const networkService = require("./networkService");
    const currentNetwork = networkService.getCurrentNetwork();

    try {
      const userWallets = storageService.getWallet(userId) || {};
      if (userWallets[currentNetwork.name]) {
        await this.bot.sendMessage(
          chatId,
          `You already have a wallet on ${currentNetwork.name}!\n` +
          `Your wallet address: ${userWallets[currentNetwork.name].address}\n\n` +
          `Use /network <network-name> to switch networks if you want to create a wallet on another network.`,
        );
        return;
      }

      const networkName = currentNetwork.name;
      const walletResponse = await circleService.createWallet(userId);
      if (!walletResponse?.walletData?.data?.wallets?.[0]) {
        throw new Error('Failed to create wallet - invalid response from Circle API');
      }

      const walletInfo = {
        walletId: walletResponse.walletId,
        address: walletResponse.walletData.data.wallets[0].address
      };

      const existingWallets = storageService.getWallet(userId) || {};
      existingWallets[networkName] = walletInfo;
      storageService.saveWallet(userId, existingWallets);

      await this.bot.sendMessage(
        chatId,
        `✅ Wallet created on ${networkName}!\nAddress: ${walletInfo.address}`,
      );
    } catch (error) {
      console.error('Wallet creation error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
      await this.bot.sendMessage(
        chatId,
        `❌ Error creating wallet: ${errorMessage}\nPlease try again later.`,
      );
    }
  }

  async handleBalance(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const currentNetwork = networkService.getCurrentNetwork().name;

    try {
      const wallets = storageService.getWallet(userId);
      if (!wallets || !wallets[currentNetwork]) {
        await this.bot.sendMessage(
          chatId,
          "Create a wallet first with /createWallet",
        );
        return;
      }

      const balance = await circleService.getWalletBalance(wallets[currentNetwork].walletId);
      await this.bot.sendMessage(
        chatId,
        `USDC Balance on ${balance.network}: ${balance.usdc} USDC`,
      );
    } catch (error) {
      await this.bot.sendMessage(
        chatId,
        "Error getting balance. Try again later.",
      );
    }
  }

  async handleAddress(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const currentNetwork = networkService.getCurrentNetwork().name;

    const wallets = storageService.getWallet(userId);
    if (!wallets || !wallets[currentNetwork]) {
      await this.bot.sendMessage(
        chatId,
        `No wallet found for ${currentNetwork}. Create one with /createWallet`,
      );
      return;
    }

    await this.bot.sendMessage(
      chatId,
      `Wallet address on ${currentNetwork}: ${wallets[currentNetwork].address}`,
    );
  }

  async handleWalletId(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const currentNetwork = networkService.getCurrentNetwork().name;

    const wallets = storageService.getWallet(userId);
    if (!wallets || !wallets[currentNetwork]) {
      await this.bot.sendMessage(
        chatId,
        `No wallet found for ${currentNetwork}. Create one with /createWallet`,
      );
      return;
    }

    await this.bot.sendMessage(
      chatId,
      `Wallet ID on ${currentNetwork}: ${wallets[currentNetwork].walletId}`,
    );
  }

  async handleSend(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    try {
      const currentNetwork = networkService.getCurrentNetwork().name;
      const wallets = storageService.getWallet(userId);
      if (!wallets || !wallets[currentNetwork]) {
        throw new Error(`No wallet found for ${currentNetwork}. Please create a wallet first using /createWallet`);
      }

      const params = match[1].split(" ");
      if (params.length !== 2) {
        throw new Error("Invalid format. Use: /send <address> <amount>");
      }

      const [destinationAddress, amount] = params;
      await this.bot.sendMessage(chatId, `Processing transaction on ${currentNetwork}...`);
      
      const txResponse = await circleService.sendTransaction(
        wallets[currentNetwork].walletId,
        destinationAddress,
        amount,
      );

      const message =
        `✅ Transaction submitted on ${currentNetwork}!\n\n` +
        `Amount: ${amount} USDC\n` +
        `To: ${destinationAddress}\n` +
        `Transaction ID: ${txResponse.id}`;

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      console.error("Error sending transaction:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Error: ${error.message || "Failed to send transaction. Please try again later."}`,
      );
    }
  }

  async handleCCTP(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    try {
      const wallet = storageService.getWallet(userId);
      if (!wallet) {
        await this.bot.sendMessage(
          chatId,
          "Create a wallet first with /createWallet",
        );
        return;
      }

      const params = match[1].split(" ");
      if (params.length !== 3) {
        await this.bot.sendMessage(
          chatId,
          "Invalid format. Use: /cctp <destination-network> <address> <amount>",
        );
        return;
      }

      const [destinationNetwork, destinationAddress, amount] = params;
      const sourceNetwork = networkService.getCurrentNetwork().name;

      // Validate networks
      const destinationNetworkUpper = destinationNetwork.toUpperCase();
      const sourceNetworkUpper = sourceNetwork.toUpperCase();
      
      if (!CCTP.domains[destinationNetworkUpper] || !CCTP.contracts[destinationNetworkUpper]) {
        await this.bot.sendMessage(
          chatId,
          "Invalid destination network. Supported networks for CCTP: " + Object.keys(CCTP.domains).join(", "),
        );
        return;
      }

      if (!CCTP.domains[sourceNetworkUpper] || !CCTP.contracts[sourceNetworkUpper]) {
        await this.bot.sendMessage(
          chatId,
          `Invalid source network: ${sourceNetwork}. Please switch to a supported network first.`,
        );
        return;
      }

      const wallet = wallet[sourceNetworkUpper];
      if (!wallet) {
        await this.bot.sendMessage(
          chatId,
          `No wallet found for ${sourceNetwork}. Create one first with /createWallet`,
        );
        return;
      }

      await this.bot.sendMessage(chatId, "Initiating cross-chain transfer...");

      const result = await circleService.crossChainTransfer(
        wallet.walletId,
        sourceNetwork,
        destinationNetwork.toUpperCase(),
        destinationAddress,
        amount,
      );

      const message =
        `✅ Cross-chain transfer initiated!\n\n` +
        `From: ${sourceNetwork}\n` +
        `To: ${destinationNetwork}\n` +
        `Amount: ${amount} USDC\n` +
        `Recipient: ${destinationAddress}\n\n` +
        `Transactions:\n` +
        `Approve: ${result.approveTx}\n` +
        `Burn: ${result.burnTx}\n` +
        `Receive: ${result.receiveTx}`;

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      console.error("Error in CCTP transfer:", error);
      await this.bot.sendMessage(
        chatId,
        `❌ Error: ${error.message || "Failed to execute cross-chain transfer"}`,
      );
    }
  }
}

module.exports = new TelegramService();
