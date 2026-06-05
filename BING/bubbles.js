document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById("bubbleCanvas") || 
                 document.getElementById("bubbleCanvasView") ||
                 document.getElementById("bubbleCanvasSidebar");
  
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  
  // Set canvas size based on its container
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (canvas.id === "bubbleCanvasSidebar") {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Determine bubble count based on canvas
  const bubbleCount = canvas.id === "bubbleCanvasSidebar" ? 30 : 25;
  
  const bubbles = Array.from({ length: bubbleCount }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 12 + 4,
    speed: Math.random() * 0.8 + 0.4,
    color: `rgba(${Math.random()*50 + 200}, ${Math.random()*50 + 200}, 255, ${Math.random() * 0.5 + 0.3})`
  }));

  function drawBubbles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bubbles.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowBlur = 25;
      ctx.shadowColor = b.color;
      ctx.fill();
      b.y -= b.speed;
      if (b.y + b.r < 0) {
        b.y = canvas.height + b.r;
        b.x = Math.random() * canvas.width;
        b.r = Math.random() * 12 + 4;
      }
    });
    requestAnimationFrame(drawBubbles);
  }
  drawBubbles();
});