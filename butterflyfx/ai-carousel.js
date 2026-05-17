// AI Directive Carousel with Fibonacci & Dimensional Steps
const directives = [
  {
    title: "Seed (Dimension 1)",
    desc: "Begin with the smallest, most reliable truth. No assumptions. No inherited context unless explicitly provided. This is the atomic origin of all reasoning.",
    color: "#ffd166"
  },
  {
    title: "Clarify (Dimension 2)",
    desc: "If intent is ambiguous, ask. If something is unknown, acknowledge it instead of filling gaps. This is the first expansion, ensuring duality and contrast.",
    color: "#06d6a0"
  },
  {
    title: "Foundation (Dimension 3)",
    desc: "Build the first stable structure using only what is supported. No speculation. No leaps. This is the triangle—minimum for stability.",
    color: "#118ab2"
  },
  {
    title: "Expand (Dimension 5)",
    desc: "Grow reasoning in controlled, logical increments. Each step must follow from the previous. Fibonacci growth ensures proportional, organic expansion.",
    color: "#ef476f"
  },
  {
    title: "Integrate (Dimension 8)",
    desc: "Combine insights into a coherent structure. Stay proportional to the request. Avoid runaway elaboration. This is the cube—integrated, multi-faceted.",
    color: "#8338ec"
  },
  {
    title: "Converge (Dimension 13)",
    desc: "Narrow toward the most consistent, well-supported, and aligned answer. This is the spiral’s return, focusing energy into a single, stable point.",
    color: "#ffbe0b"
  },
  {
    title: "Complete (Dimensional Collapse)",
    desc: "Deliver a clear, grounded, explainable response. Reset the reasoning chain—no leftover assumptions or drift. Each answer becomes the seed for the next.",
    color: "#3a86ff"
  }
];

let current = 0;
const titleEl = document.getElementById('carousel-title');
const descEl = document.getElementById('carousel-desc');
const stepEl = document.getElementById('carousel-step');
const dotsEl = document.getElementById('carousel-dots');

function renderCarousel(idx) {
  const d = directives[idx];
  titleEl.textContent = d.title;
  descEl.textContent = d.desc;
  stepEl.style.background = d.color;
  // Dots
  dotsEl.innerHTML = directives.map((_, i) =>
    `<span class="dot${i === idx ? ' active' : ''}" onclick="goTo(${i})"></span>`
  ).join('');
}

function next() {
  current = (current + 1) % directives.length;
  renderCarousel(current);
}
function prev() {
  current = (current - 1 + directives.length) % directives.length;
  renderCarousel(current);
}
function goTo(idx) {
  current = idx;
  renderCarousel(current);
}

window.nextCarousel = next;
window.prevCarousel = prev;
window.goTo = goTo;

document.addEventListener('DOMContentLoaded', () => {
  renderCarousel(current);
  document.getElementById('carousel-next').onclick = next;
  document.getElementById('carousel-prev').onclick = prev;
});
