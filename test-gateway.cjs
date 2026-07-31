(async () => {
    try {
        console.log("Sending request...");
        const res = await fetch('http://localhost:3000/api/gateway/generate-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: "a cat",
                model: "google/gemini-3.1-flash-image-preview",
                resolution: "1K"
            })
        });
        
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text.substring(0, 500));
    } catch (e) {
        console.error("Fetch Error:", e);
    }
})();
