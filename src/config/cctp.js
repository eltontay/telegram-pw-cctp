const CCTP_CONFIG = {
  domains: {
    "ETH-SEPOLIA": 0,
    "AVAX-FUJI": 1,
    "ARB-SEPOLIA": 3,
    "BASE-SEPOLIA": 6,
    "MATIC-AMOY": 7,
  },
  rpc: {
    "ETH-SEPOLIA": process.env.INFURA_ETH_SEPOLIA,
    "AVAX-FUJI": process.env.INFURA_AVAX_FUJI,
    "ARB-SEPOLIA": process.env.INFURA_ARB_SEPOLIA,
    "BASE-SEPOLIA": process.env.INFURA_BASE_SEPOLIA,
  },
  contracts: {
    "ETH-SEPOLIA": {
      tokenMessenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
      tokenMinter: "0xb43db544e2c27092c107639ad201b3defabcf192",
      usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    },
    "AVAX-FUJI": {
      tokenMessenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
      tokenMinter: "0xb43db544e2c27092c107639ad201b3defabcf192",
      usdc: "0x5425890298aed601595a70ab815c96711a31bc65",
    },
    "ARB-SEPOLIA": {
      tokenMessenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
      tokenMinter: "0xb43db544e2c27092c107639ad201b3defabcf192",
      usdc: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
    },
    "BASE-SEPOLIA": {
      tokenMessenger: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      messageTransmitter: "0xe737e5cebeeba77efe34d4aa090756590b1ce275",
      tokenMinter: "0xb43db544e2c27092c107639ad201b3defabcf192",
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7c",
    },
  },
  abis: {
    usdc: [
      {
        inputs: [
          {
            internalType: "address",
            name: "implementationContract",
            type: "address",
          },
        ],
        stateMutability: "nonpayable",
        type: "constructor",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: "address",
            name: "previousAdmin",
            type: "address",
          },
          {
            indexed: false,
            internalType: "address",
            name: "newAdmin",
            type: "address",
          },
        ],
        name: "AdminChanged",
        type: "event",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: "address",
            name: "implementation",
            type: "address",
          },
        ],
        name: "Upgraded",
        type: "event",
      },
      { stateMutability: "payable", type: "fallback" },
      {
        inputs: [],
        name: "admin",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          { internalType: "address", name: "newAdmin", type: "address" },
        ],
        name: "changeAdmin",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [],
        name: "implementation",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
        ],
        name: "upgradeTo",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        name: "upgradeToAndCall",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
    ],
    tokenMessenger: [
      {
        inputs: [
          { internalType: "address", name: "_logic", type: "address" },
          { internalType: "address", name: "admin_", type: "address" },
          { internalType: "bytes", name: "_data", type: "bytes" },
        ],
        stateMutability: "payable",
        type: "constructor",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: "address",
            name: "previousAdmin",
            type: "address",
          },
          {
            indexed: false,
            internalType: "address",
            name: "newAdmin",
            type: "address",
          },
        ],
        name: "AdminChanged",
        type: "event",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: true,
            internalType: "address",
            name: "implementation",
            type: "address",
          },
        ],
        name: "Upgraded",
        type: "event",
      },
      { stateMutability: "payable", type: "fallback" },
      {
        inputs: [],
        name: "admin",
        outputs: [{ internalType: "address", name: "admin_", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          { internalType: "address", name: "newAdmin", type: "address" },
        ],
        name: "changeAdmin",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [],
        name: "implementation",
        outputs: [
          { internalType: "address", name: "implementation_", type: "address" },
        ],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
        ],
        name: "upgradeTo",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        name: "upgradeToAndCall",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
      { stateMutability: "payable", type: "receive" },
    ],
    messageTransmitter: [
      {
        inputs: [
          { internalType: "address", name: "_logic", type: "address" },
          { internalType: "address", name: "admin_", type: "address" },
          { internalType: "bytes", name: "_data", type: "bytes" },
        ],
        stateMutability: "payable",
        type: "constructor",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: false,
            internalType: "address",
            name: "previousAdmin",
            type: "address",
          },
          {
            indexed: false,
            internalType: "address",
            name: "newAdmin",
            type: "address",
          },
        ],
        name: "AdminChanged",
        type: "event",
      },
      {
        anonymous: false,
        inputs: [
          {
            indexed: true,
            internalType: "address",
            name: "implementation",
            type: "address",
          },
        ],
        name: "Upgraded",
        type: "event",
      },
      { stateMutability: "payable", type: "fallback" },
      {
        inputs: [],
        name: "admin",
        outputs: [{ internalType: "address", name: "admin_", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          { internalType: "address", name: "newAdmin", type: "address" },
        ],
        name: "changeAdmin",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [],
        name: "implementation",
        outputs: [
          { internalType: "address", name: "implementation_", type: "address" },
        ],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
        ],
        name: "upgradeTo",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "newImplementation",
            type: "address",
          },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        name: "upgradeToAndCall",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
      { stateMutability: "payable", type: "receive" },
    ],
  },
};

module.exports = CCTP_CONFIG;
