import type { FirewallResult } from "../firewall/index.js";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bgRed: "\x1b[41m\x1b[97m",
  bgGreen: "\x1b[42m\x1b[30m",
};

const bar = (s: string) => `${c.dim}${"─".repeat(58)}${c.reset}\n${s}`;

export function renderHeader(intent: string, totalRows: number) {
  console.log(`\n${c.bold}${c.cyan}  ContextWall — Data Firewall${c.reset}`);
  console.log(`${c.dim}  ──────────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.bold}Agent intent:${c.reset} "${intent}"`);
  console.log(`  ${c.dim}Upstream job will produce up to ${totalRows} rows...${c.reset}\n`);
}

export function logEmit(i: number) {
  process.stdout.write(`${c.dim}  ↳ upstream emitted row ${i}\r${c.reset}`);
}

export function renderResult(r: FirewallResult, intent: string, totalRows: number) {
  const { verdict, stats } = r;
  console.log("\n");

  if (verdict.ok) {
    console.log(`  ${c.bgGreen} ✔ PASSED ${c.reset}  ${c.green}Clean data delivered to agent.${c.reset}`);
  } else {
    console.log(`  ${c.bgRed} ⛔ CIRCUIT BROKEN ${c.reset}  ${c.red}Toxic data blocked.${c.reset}`);
  }

  console.log(bar(""));
  const tier = verdict.tier ? verdict.tier.toUpperCase() : "—";
  console.log(`  ${c.bold}Tripped by   ${c.reset} ${verdict.ok ? c.green : c.red}${tier}${c.reset}  (${verdict.reason})`);
  console.log(`  ${c.bold}Reason       ${c.reset} ${verdict.detail}`);
  console.log(bar(""));
  console.log(`  Rows upstream produced   ${c.bold}${stats.itemsStreamed}${c.reset} / ${totalRows}`);
  console.log(`  Rows delivered to agent  ${c.bold}${stats.itemsDelivered}${c.reset}`);
  console.log(
    `  Upstream container        ${stats.aborted ? `${c.yellow}ABORTED (billing stopped)${c.reset}` : `${c.green}completed${c.reset}`}`,
  );
  console.log(bar(""));
  if (!verdict.ok) {
    console.log(`  ${c.bold}${c.green}Tokens kept out of context  ~${stats.tokensBlocked.toLocaleString()}${c.reset}`);
    console.log(`  ${c.bold}${c.green}Downstream $ saved          ~$${stats.usdSaved.toFixed(4)}${c.reset}`);
    const savedRatio = Math.round((1 - stats.itemsStreamed / totalRows) * 100);
    console.log(`  ${c.dim}Stopped after ${stats.itemsStreamed}/${totalRows} rows → ~${Math.max(savedRatio, 0)}% of upstream work never ran.${c.reset}`);
  } else {
    console.log(`  ${c.green}No waste — all rows were genuine data.${c.reset}`);
  }
  console.log("");
}
