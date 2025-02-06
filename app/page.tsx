export default function Home() {
  return (
    <div
      style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      Start prompting.
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { NetworkSelector } from '@/components/NetworkSelector';

export default function Home() {
  const [currentNetwork, setCurrentNetwork] = useState('ETH-SEPOLIA');
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);

  const handleNetworkChange = async (network: string) => {
    setCurrentNetwork(network);
    setLoading(true);
    try {
      const response = await fetch(`/api/balance?network=${network}`);
      const data = await response.json();
      setBalance(data.balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <NetworkSelector 
          currentNetwork={currentNetwork}
          onNetworkChange={handleNetworkChange}
        />
        <div className="mt-4">
          {loading ? (
            <p>Loading balance...</p>
          ) : (
            <p>Balance: {balance} USDC</p>
          )}
        </div>
      </div>
    </main>
  );
}
