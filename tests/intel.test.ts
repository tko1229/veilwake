/**
 * Derivation tests: raw Nansen rows in, display-safe clues out.
 * Rows mirror the shapes observed from the live API on 26 Sep 2026.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  archetypeOf,
  deriveBuyers,
  deriveProfile,
  deriveTrades,
  deriveTransfers,
  deriveTrend,
  deriveWeather,
  perpShadowFor,
} from '../shared/intel.ts';

const provenance = { endpoint: 'test', fetchedAt: '2026-09-26T06:00:00Z', timeframe: '24h', requestId: 'req-x', cached: false };

test('labels collapse into coarse families and are never echoed back', () => {
  assert.equal(archetypeOf('30D Smart Trader'), 'smart');
  assert.equal(archetypeOf('Fund'), 'smart');
  assert.equal(archetypeOf('Binance 14'), 'exchange');
  assert.equal(archetypeOf('Coinbase: Hot Wallet'), 'exchange');
  assert.equal(archetypeOf('$PAYD Token Deployer'), 'insider');
  assert.equal(archetypeOf('Liquidity Pool'), 'machine');
  assert.equal(archetypeOf('BananaGun Bot User'), 'machine');
  assert.equal(archetypeOf('Token Millionaire'), 'size');
  assert.equal(archetypeOf('STONK Whale'), 'size');
  assert.equal(archetypeOf('High Activity'), 'active');
  assert.equal(archetypeOf('kubix.eth*'), 'other');
  assert.equal(archetypeOf(''), 'unlabeled');
  assert.equal(archetypeOf(null), 'unlabeled');
});

test('Who Bought/Sold: round-tripping buyers read as churn, and addresses stay server-side', () => {
  const rows = [
    { address: '0xsecretwhale', address_label: 'Token Millionaire', bought_volume_usd: 96_216_118, sold_volume_usd: 88_994_024 },
    { address: '0xsecond', address_label: 'kubix.eth*', bought_volume_usd: 22_763_585, sold_volume_usd: 22_550_453 },
    { address: '0xthird', address_label: 'High Balance', bought_volume_usd: 17_684_908, sold_volume_usd: 17_633_445 },
  ];
  const { clue, profileTarget } = deriveBuyers(rows, provenance);
  assert.equal(clue.verdict, 'Churn');
  assert.ok(clue.pressure >= 2);
  assert.equal(profileTarget, '0xsecretwhale', 'the largest net buyer is kept for the Profiler');
  const json = JSON.stringify(clue);
  for (const secret of ['0xsecretwhale', '0xsecond', 'kubix', 'Millionaire', '96216118', '96,216,118']) assert.ok(!json.includes(secret), `leaked ${secret}`);
});

test('Who Bought/Sold: Smart Money net buyers ease pressure; empty windows are honest', () => {
  const smart = deriveBuyers(
    [
      { address: '0xa', address_label: '90D Smart Trader', bought_volume_usd: 500_000, sold_volume_usd: 0 },
      { address: '0xb', address_label: null, bought_volume_usd: 400_000, sold_volume_usd: 100_000 },
    ],
    provenance,
  );
  assert.ok(smart.clue.pressure < 0);
  assert.ok(smart.clue.facts.some((fact) => fact.label === 'Smart Money net buyers' && fact.value === '1'));
  const empty = deriveBuyers([], provenance);
  assert.equal(empty.clue.status, 'empty');
  assert.equal(empty.clue.pressure, 0);
  assert.equal(empty.profileTarget, null);
});

test('DEX Trades: sell-heavy tapes ebb, buy-heavy tapes flood, thin tapes add uncertainty', () => {
  const ebb = deriveTrades(
    [
      { action: 'SELL', estimated_value_usd: 700, trader_address_label: 'High Activity', trader_address: '0x1' },
      { action: 'BUY', estimated_value_usd: 200, trader_address_label: '', trader_address: '0x2' },
      { action: 'SELL', estimated_value_usd: 100, trader_address_label: null, trader_address: '0x3' },
    ],
    provenance,
    true,
  );
  assert.equal(ebb.verdict, 'Ebb tide');
  assert.equal(ebb.pressure, 2);
  assert.ok(!JSON.stringify(ebb).includes('0x1'));
  const flood = deriveTrades(Array.from({ length: 10 }, (_, i) => ({ action: i < 8 ? 'BUY' : 'SELL', estimated_value_usd: 100 })), provenance);
  assert.equal(flood.verdict, 'Flood tide');
  assert.equal(flood.pressure, -1);
  assert.equal(deriveTrades([], provenance).verdict, 'Slack water');
});

test('Token Transfers: exchange deposits load the gates; withdrawals leave port', () => {
  const loading = deriveTransfers(
    [
      { from_address_label: 'Token Millionaire', to_address_label: 'Binance 14', transfer_value_usd: 5e6 },
      { from_address_label: '', to_address_label: 'OKX Hot Wallet', transfer_value_usd: 4e6 },
      { from_address_label: 'High Balance', to_address_label: 'Coinbase 2', transfer_value_usd: 3e6 },
    ],
    provenance,
  );
  assert.equal(loading.verdict, 'Loading the gates');
  assert.equal(loading.pressure, 2);
  assert.ok(!JSON.stringify(loading).includes('Binance'));
  const leaving = deriveTransfers(
    [
      { from_address_label: 'Kraken 3', to_address_label: '', transfer_value_usd: 1e6 },
      { from_address_label: 'Bybit Hot Wallet', to_address_label: 'STONK Whale', transfer_value_usd: 1e6 },
    ],
    provenance,
  );
  assert.equal(leaving.verdict, 'Cargo leaving port');
  assert.equal(leaving.pressure, -1);
});

test('Flows: a weekly Smart Money trim is distribution; no series is coverage, not safety', () => {
  const trend = deriveTrend(
    [
      { date: '2026-09-19T06:00:00Z', token_amount: 151.99, holders_count: 75 },
      { date: '2026-09-22T18:00:00Z', token_amount: 154.49, holders_count: 82 },
      { date: '2026-09-26T05:00:00Z', token_amount: 94.52, holders_count: 76 },
    ],
    provenance,
  );
  assert.equal(trend.verdict, 'Distributing');
  assert.equal(trend.direction, 'out');
  assert.equal(trend.pressure, 2);
  const none = deriveTrend([], provenance);
  assert.equal(none.status, 'empty');
  assert.equal(none.pressure, 0);
});

test('Profiler: no record, seasoned hands and losing hands read differently', () => {
  const empty = deriveProfile({ traded_token_count: 0, traded_times: 0, realized_pnl_usd: 0, win_rate: 0, top5_tokens: [] }, provenance);
  assert.equal(empty.verdict, 'No track record');
  assert.equal(empty.pressure, 1);
  const seasoned = deriveProfile({ traded_token_count: 19, traded_times: 58, realized_pnl_usd: 12_345, win_rate: 0.64, top5_tokens: [{ token_address: '0xsecret' }] }, provenance);
  assert.equal(seasoned.verdict, 'Seasoned hand');
  assert.ok(!JSON.stringify(seasoned).includes('12345'), 'realized PnL is reduced to a sign');
  assert.ok(!JSON.stringify(seasoned).includes('0xsecret'));
  const losing = deriveProfile({ traded_token_count: 4, traded_times: 9, realized_pnl_usd: -500, win_rate: 0.2 }, provenance);
  assert.equal(losing.verdict, 'Struggling hand');
});

test('Perp Screener: net Smart Money selling is a headwind, and spot tokens find their perp shadow', () => {
  const rows = [
    { token_symbol: 'BTC', smart_money_volume: 55e6, net_position_change: -3.1e6, current_smart_money_position_longs_usd: 95e6, current_smart_money_position_shorts_usd: -30e6, funding: 0.0000089 },
    { token_symbol: 'ETH', smart_money_volume: 9.6e6, net_position_change: 4.2e6, current_smart_money_position_longs_usd: 75e6, current_smart_money_position_shorts_usd: -30e6, funding: 0.0000125 },
    { token_symbol: 'HYPE', smart_money_volume: 14.8e6, net_position_change: -9e6, current_smart_money_position_longs_usd: 46e6, current_smart_money_position_shorts_usd: -9e6, funding: 0.0000125 },
    { token_symbol: 'ENA', smart_money_volume: 8e6, net_position_change: -2.7e6, current_smart_money_position_longs_usd: 3.7e6, current_smart_money_position_shorts_usd: -4.3e6, funding: 0.00002 },
  ];
  const { weather, shadows } = deriveWeather(rows, provenance);
  assert.ok(['Headwind', 'Squall'].includes(weather.name));
  assert.ok(weather.pressure > 0);
  assert.equal(perpShadowFor('WETH', shadows).listed, true, 'WETH maps to the ETH perp');
  assert.equal(perpShadowFor('ENA', shadows).bias, 'balanced');
  assert.equal(perpShadowFor('STONK', shadows).listed, false);
  const fogged = deriveWeather([], provenance);
  assert.equal(fogged.weather.status, 'unavailable');
  assert.equal(fogged.weather.pressure, 0);
});
