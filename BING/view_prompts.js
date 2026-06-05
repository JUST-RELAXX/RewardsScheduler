
document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("chat-container");
  const data = await chrome.storage.session.get("queries");
  if (data.queries && data.queries.length > 0) {
    data.queries.forEach((q, i) => {
      const bubble = document.createElement("div");
      bubble.classList.add("chat-bubble");
      bubble.textContent = `${i + 1}. ${q}`;
      container.appendChild(bubble);
    });
  } else {
    container.innerHTML += "<p>No prompts available.</p>";
  }

  // Initialize bubbles for view window
  const canvas = document.getElementById("bubbleCanvasView");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const bubbles = Array.from({ length: 20 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 10 + 5,
      speed: Math.random() * 0.7 + 0.3,
      color: `rgba(0, 230, 255, ${Math.random() * 0.5 + 0.3})`
    }));

    function drawBubbles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bubbles.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = b.color;
        ctx.fill();
        b.y -= b.speed;
        if (b.y + b.r < 0) {
          b.y = canvas.height + b.r;
          b.x = Math.random() * canvas.width;
        }
      });
      requestAnimationFrame(drawBubbles);
    }
    drawBubbles();
  }
});