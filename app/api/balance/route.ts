
import { NextResponse } from 'next/server';
import { CircleService } from '@/src/services/circleService';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network');
  
  if (!network) {
    return NextResponse.json({ error: 'Network parameter is required' }, { status: 400 });
  }

  try {
    const circleService = new CircleService(null);
    await circleService.init();
    
    // For demo purposes, using a fixed walletId - you should get this from your auth system
    const balance = await circleService.getWalletBalance(walletId);
    
    return NextResponse.json({ balance: balance.usdc });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
