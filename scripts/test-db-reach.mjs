import net from "node:net";

const hosts = [
  ["direct", "db.ebtxridlofskqxdwgfyg.supabase.co", 5432],
  ["pooler5432", "aws-0-eu-west-3.pooler.supabase.com", 5432],
  ["pooler6543", "aws-0-eu-west-3.pooler.supabase.com", 6543],
];

function probe(name, host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }, () => {
      console.log(`${name}: REACHABLE ${host}:${port}`);
      s.end();
      resolve(true);
    });
    s.setTimeout(8000, () => {
      console.log(`${name}: TIMEOUT ${host}:${port}`);
      s.destroy();
      resolve(false);
    });
    s.on("error", (e) => {
      console.log(`${name}: ERROR ${e.code} ${host}:${port}`);
      resolve(false);
    });
  });
}

for (const [n, h, p] of hosts) {
  await probe(n, h, p);
}
