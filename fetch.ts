async function test() {
  try {
    const res = await fetch("https://manwah-ai-06build-649589535807.asia-east1.run.app/api/routerhub/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello" })
    });
    console.log(res.status, res.statusText);
    console.log("Headers:", Object.fromEntries(res.headers.entries()));
    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.error(e);
  }
}
test();
