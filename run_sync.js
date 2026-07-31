async function run() {
  const res = await fetch("http://127.0.0.1:3000/api/sync-logs");
  const txt = await res.text();
  console.log(txt);
}
run();
