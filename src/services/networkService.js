
const networks = require('../../data/networks.json');

class NetworkService {
  constructor() {
    this.currentNetwork = process.env.NETWORK || 'ARB-SEPOLIA';
  }

  setNetwork(networkName) {
    if (networks[networkName]) {
      this.currentNetwork = networkName;
      return networks[networkName];
    }
    throw new Error('Invalid network');
  }

  getCurrentNetwork() {
    return networks[this.currentNetwork];
  }

  getAllNetworks() {
    return networks;
  }

  isValidNetwork(networkName) {
    return networks.hasOwnProperty(networkName.toUpperCase());
  }
}

module.exports = new NetworkService();
