async function test() {
  try {
    const res = await fetch("https://manwah-ai-06build-649589535807.asia-east1.run.app/api/routerhub/generate-image", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://manwah-ai-06build-649589535807.asia-east1.run.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      }
    });
    console.log(res.status, res.statusText);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
  } catch(e) { console.error(e); }
}
test();
