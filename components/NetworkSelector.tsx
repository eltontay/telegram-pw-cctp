
import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import networks from '@/data/networks.json';

interface NetworkSelectorProps {
  onNetworkChange: (network: string) => void;
  currentNetwork: string;
}

export function NetworkSelector({ onNetworkChange, currentNetwork }: NetworkSelectorProps) {
  const networkOptions = Object.entries(networks).map(([key, network]) => ({
    value: key,
    label: network.name,
    isTestnet: network.isTestnet
  }));

  return (
    <Select value={currentNetwork} onValueChange={onNetworkChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select network" />
      </SelectTrigger>
      <SelectContent>
        {networkOptions.map((network) => (
          <SelectItem key={network.value} value={network.value}>
            {network.label} {network.isTestnet ? '(Testnet)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
