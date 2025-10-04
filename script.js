// Get particle canvas
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

// Get entropy graph canvas
const graphCanvas = document.getElementById('entropyGraph');
const graphCtx = graphCanvas.getContext('2d');

// Entropy tracking
const entropyHistory = [];
const maxHistoryPoints = 600; // 60 seconds at 10 samples per second
const entropyUpdateInterval = 100; // Update every 100ms
let lastEntropyUpdate = 0;
// Use a fixed grid resolution for entropy; expose so plotting can scale
const ENTROPY_GRID_SIZE = 32;
const MAX_SPECIFIC_ENTROPY = Math.log(ENTROPY_GRID_SIZE * ENTROPY_GRID_SIZE); // nats/particle

// Function to resize canvases to match CSS size
function resizeCanvases() {
    // Resize particle canvas
    const particleWidth = canvas.clientWidth;
    const particleHeight = canvas.clientHeight;
    if (canvas.width !== particleWidth || canvas.height !== particleHeight) {
        canvas.width = particleWidth;
        canvas.height = particleHeight;
    }

    // Resize graph canvas
    const graphWidth = graphCanvas.clientWidth;
    const graphHeight = graphCanvas.clientHeight;
    if (graphCanvas.width !== graphWidth || graphCanvas.height !== graphHeight) {
        graphCanvas.width = graphWidth;
        graphCanvas.height = graphHeight;
    }
}

// Particle class
class Particle {
    constructor(x, y) {
        this.radius = 4;
        if (x !== undefined && y !== undefined) {
            this.init(x, y);
        } else {
            this.resetPosition();
        }
    }

    init(x, y) {
        this.x = x;
        this.y = y;
        this.dx = (Math.random() - 0.5) * 0.4; // Random velocity X
        this.dy = (Math.random() - 0.5) * 0.4; // Random velocity Y
        this.color = `hsl(${Math.random() * 360}, 50%, 50%)`;
    }

    resetPosition() {
        this.x = Math.random() * (canvas.width - this.radius * 2) + this.radius;
        this.y = Math.random() * (canvas.height - this.radius * 2) + this.radius;
        this.dx = (Math.random() - 0.5) * 4;
        this.dy = (Math.random() - 0.5) * 4;
        this.color = `hsl(${Math.random() * 360}, 50%, 50%)`;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }

    update(particles) {
        // Bounce off walls
        if (this.x + this.radius > canvas.width || this.x - this.radius < 0) {
            this.dx = -this.dx;
            this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x));
        }
        if (this.y + this.radius > canvas.height || this.y - this.radius < 0) {
            this.dy = -this.dy;
            this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y));
        }

        // Check collisions with other particles
        for (let other of particles) {
            if (other === this) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.radius + other.radius) {
                // Collision detected - calculate elastic collision
                const angle = Math.atan2(dy, dx);
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);

                // Rotate velocities to collision axis
                const vx1 = this.dx * cos + this.dy * sin;
                const vy1 = this.dy * cos - this.dx * sin;
                const vx2 = other.dx * cos + other.dy * sin;
                const vy2 = other.dy * cos - other.dx * sin;

                // Swap velocities along collision axis (elastic collision)
                this.dx = vx2 * cos - vy1 * sin;
                this.dy = vy1 * cos + vx2 * sin;
                other.dx = vx1 * cos - vy2 * sin;
                other.dy = vy2 * cos + vx1 * sin;

                // Move particles apart to prevent sticking
                const overlap = (this.radius + other.radius - distance) / 2;
                this.x -= overlap * cos;
                this.y -= overlap * sin;
                other.x += overlap * cos;
                other.y += overlap * sin;
            }
        }

        // Update position
        this.x += this.dx;
        this.y += this.dy;

        this.draw();
    }

    // Get particle's kinetic energy
    getKineticEnergy() {
        const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        return 0.5 * speed * speed;
    }
}

// Calculate system entropy
function calculateEntropy() {
    if (particles.length === 0) return 0;

    // Spatial entropy only (Shannon entropy of occupancy grid)
    let spatialEntropy = 0;

    // Grid-based spatial entropy calculation
    const gridSize = ENTROPY_GRID_SIZE; // finer grid for smoother response
    const gridCellCount = gridSize * gridSize;
    const grid = new Array(gridCellCount).fill(0);

    // Accumulate counts per cell, clamping indices to grid bounds
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let gridX = Math.floor((p.x / Math.max(canvas.width, 1)) * gridSize);
        let gridY = Math.floor((p.y / Math.max(canvas.height, 1)) * gridSize);
        if (gridX < 0) gridX = 0; else if (gridX >= gridSize) gridX = gridSize - 1;
        if (gridY < 0) gridY = 0; else if (gridY >= gridSize) gridY = gridSize - 1;
        const idx = gridY * gridSize + gridX;
        grid[idx]++;
    }

    const totalParticles = particles.length;
    for (let i = 0; i < grid.length; i++) {
        const count = grid[i];
        if (count > 0) {
            const probability = count / totalParticles;
            spatialEntropy -= probability * Math.log(probability);
        }
    }

    // Return both specific entropy H and normalized H/H_max with H_max = ln(min(N, M))
    const hMax = Math.log(Math.min(totalParticles, gridCellCount));
    const normalized = hMax > 0 ? Math.max(0, Math.min(spatialEntropy / hMax, 1)) : 0;
    return { H: spatialEntropy, Hmax: hMax, normalized };
}

// Update and draw entropy graph
function updateEntropyGraph() {
    const currentTime = performance.now();
    if (currentTime - lastEntropyUpdate >= entropyUpdateInterval) {
        const { H, Hmax, normalized } = calculateEntropy();
        entropyHistory.push({ H, Hmax, normalized });
        if (entropyHistory.length > maxHistoryPoints) {
            entropyHistory.shift();
        }
        lastEntropyUpdate = currentTime;
    }

    // Clear graph
    graphCtx.fillStyle = 'black';
    graphCtx.fillRect(0, 0, graphCanvas.width, graphCanvas.height);

    // Draw grid
    graphCtx.strokeStyle = '#333';
    graphCtx.lineWidth = 1;
    const gridRows = 5;
    const rowHeight = graphCanvas.height / gridRows;

    // Horizontal grid lines
    for (let i = 1; i < gridRows; i++) {
        const y = i * rowHeight;
        graphCtx.beginPath();
        graphCtx.moveTo(0, y);
        graphCtx.lineTo(graphCanvas.width, y);
        graphCtx.stroke();
    }

    // Vertical grid lines
    const gridCols = 10;
    const colWidth = graphCanvas.width / gridCols;
    for (let i = 1; i < gridCols; i++) {
        const x = i * colWidth;
        graphCtx.beginPath();
        graphCtx.moveTo(x, 0);
        graphCtx.lineTo(x, graphCanvas.height);
        graphCtx.stroke();
    }

    // Draw entropy line
    if (entropyHistory.length > 1) {
        // Make line more visible
        graphCtx.strokeStyle = '#00ff00';
        graphCtx.lineWidth = 3;
        graphCtx.beginPath();

        // Use current history length so we see a line immediately
        const points = entropyHistory.length;
        const step = points > 1 ? graphCanvas.width / (points - 1) : graphCanvas.width;
        for (let index = 0; index < points; index++) {
            const entry = entropyHistory[index];
            const norm = entry && typeof entry.normalized === 'number' ? entry.normalized : 0;
            const x = index * step;
            const y = graphCanvas.height - (Math.min(norm, 0.98) * graphCanvas.height);
            if (index === 0) graphCtx.moveTo(x, y); else graphCtx.lineTo(x, y);
        }
        graphCtx.stroke();
    }

    // Draw labels at bottom
    graphCtx.fillStyle = '#fff';
    graphCtx.font = '16px Arial';
    const padding = 10;
    const bottomPadding = 25;

    // Draw title on bottom left
    graphCtx.textAlign = 'left';
    graphCtx.fillText('Specific Entropy', padding, graphCanvas.height - bottomPadding);

    // Draw current value on bottom right
    if (entropyHistory.length > 0) {
        const { H, Hmax, normalized } = entropyHistory[entropyHistory.length - 1];
        graphCtx.textAlign = 'right';
        graphCtx.fillText(`H/Hmax: ${(normalized*100).toFixed(0)}%`, graphCanvas.width - padding, graphCanvas.height - bottomPadding);
        graphCtx.fillText(`${H.toFixed(3)} / ${Hmax.toFixed(2)}`, graphCanvas.width - padding, graphCanvas.height - bottomPadding + 20);
    }
}

// Create particles array
const particles = [];
const numInitialParticles = 50;
const particlesPerSpawn = 5;

// Get canvas relative coordinates
function getCanvasRelativePosition(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX || event.touches[0].clientX) - rect.left;
    const y = (event.clientY || event.touches[0].clientY) - rect.top;
    return { x, y };
}

// Spawn particles at position
function spawnParticles(x, y, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y));
    }
}

// Event listeners for mouse/touch
canvas.addEventListener('mousedown', (event) => {
    const pos = getCanvasRelativePosition(event);
    spawnParticles(pos.x, pos.y, particlesPerSpawn);
});

canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const pos = getCanvasRelativePosition(event);
    spawnParticles(pos.x, pos.y, particlesPerSpawn);
});

// Handle continuous spawning while holding/touching
let isSpawning = false;
let spawnInterval;

function startSpawning(event) {
    isSpawning = true;
    const pos = getCanvasRelativePosition(event);
    spawnParticles(pos.x, pos.y, particlesPerSpawn);

    spawnInterval = setInterval(() => {
        if (isSpawning) {
            const pos = getCanvasRelativePosition(event);
            spawnParticles(pos.x, pos.y, particlesPerSpawn);
        }
    }, 100);
}

function stopSpawning() {
    isSpawning = false;
    clearInterval(spawnInterval);
}

canvas.addEventListener('mousedown', startSpawning);
canvas.addEventListener('mouseup', stopSpawning);
canvas.addEventListener('mouseleave', stopSpawning);

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startSpawning(e);
});
canvas.addEventListener('touchend', stopSpawning);
canvas.addEventListener('touchcancel', stopSpawning);

// Handle window resize
window.addEventListener('resize', resizeCanvases);

// Initial setup
function initParticles() {
    particles.length = 0;
    for (let i = 0; i < numInitialParticles; i++) {
        particles.push(new Particle());
    }
}

resizeCanvases();
initParticles();

// Animation loop
function animate() {
    // Clear particle canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update all particles
    particles.forEach(particle => particle.update(particles));

    // Update entropy graph
    updateEntropyGraph();

    requestAnimationFrame(animate);
}

// Start animation
animate();