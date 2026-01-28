class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.isRunning = false;
        this.isPaused = false;
        this.soundEnabled = true;
        
        // Player
        this.player = {
            x: this.canvas.width / 2 - 25,
            y: this.canvas.height - 50,
            width: 50,
            height: 30,
            speed: 7,
            color: '#4cd137'
        };
        
        // Bullets
        this.bullets = [];
        this.bulletSpeed = 8;
        
        // Enemies
        this.enemies = [];
        this.enemyRows = 3;
        this.enemyCols = 8;
        this.enemySpeed = 1;
        this.enemyDirection = 1;
        this.createEnemies();
        
        // Controls
        this.keys = {};
        
        // Sounds
        this.sounds = {
            shoot: this.createSound(800, 0.1),
            hit: this.createSound(400, 0.2),
            explode: this.createSound(200, 0.3)
        };
        
        // Event listeners
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
        
        // Initialize UI
        this.updateUI();
    }
    
    createSound(frequency, duration) {
        return {
            play: () => {
                if (!this.soundEnabled) return;
                
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = frequency;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
                
                oscillator.start();
                oscillator.stop(audioContext.currentTime + duration);
            }
        };
    }
    
    createEnemies() {
        this.enemies = [];
        const enemyWidth = 40;
        const enemyHeight = 30;
        const spacing = 10;
        
        for (let row = 0; row < this.enemyRows; row++) {
            for (let col = 0; col < this.enemyCols; col++) {
                this.enemies.push({
                    x: col * (enemyWidth + spacing) + 50,
                    y: row * (enemyHeight + spacing) + 50,
                    width: enemyWidth,
                    height: enemyHeight,
                    color: row === 0 ? '#ff6b6b' : row === 1 ? '#ff9f43' : '#feca57',
                    alive: true
                });
            }
        }
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('level').textContent = this.level;
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.isPaused = false;
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.createEnemies();
        this.updateUI();
        this.gameLoop();
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pauseBtn').textContent = this.isPaused ? 'Resume' : 'Pause';
    }
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        document.getElementById('soundBtn').textContent = `Sound: ${this.soundEnabled ? 'ON' : 'OFF'}`;
    }
    
    drawPlayer() {
        this.ctx.fillStyle = this.player.color;
        
        // Main body
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
        
        // Cockpit
        this.ctx.fillStyle = '#3498db';
        this.ctx.fillRect(this.player.x + 10, this.player.y - 10, this.player.width - 20, 10);
        
        // Engine glow
        const gradient = this.ctx.createLinearGradient(
            this.player.x, this.player.y + this.player.height,
            this.player.x, this.player.y + this.player.height + 20
        );
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(this.player.x + 5, this.player.y + this.player.height, 
                         this.player.width - 10, 20);
    }
    
    drawBullets() {
        this.ctx.fillStyle = '#3498db';
        this.bullets.forEach(bullet => {
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Trail effect
            this.ctx.fillStyle = 'rgba(52, 152, 219, 0.3)';
            for (let i = 0; i < 3; i++) {
                this.ctx.beginPath();
                this.ctx.arc(bullet.x, bullet.y + 5 + (i * 3), 3 - i, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.fillStyle = '#3498db';
        });
    }
    
    drawEnemies() {
        this.enemies.forEach(enemy => {
            if (!enemy.alive) return;
            
            this.ctx.fillStyle = enemy.color;
            
            // Enemy body
            this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
            
            // Enemy details
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(enemy.x + 5, enemy.y + 5, enemy.width - 10, 5);
            this.ctx.fillRect(enemy.x + 15, enemy.y + 15, enemy.width - 30, 5);
            
            // Pulsing effect
            const pulse = Math.sin(Date.now() / 200) * 5;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.abs(pulse * 0.05)})`;
            this.ctx.fillRect(enemy.x, enemy.y - pulse, enemy.width, 5);
        });
    }
    
    drawBackground() {
        // Stars
        for (let i = 0; i < 50; i++) {
            const x = (Math.sin(Date.now() / 1000 + i) * 100 + i * 20) % this.canvas.width;
            const y = (Math.cos(Date.now() / 1000 + i) * 100 + i * 20) % this.canvas.height;
            const size = Math.random() * 2 + 1;
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    updatePlayer() {
        if (this.keys['ArrowLeft'] || this.keys['a']) {
            this.player.x = Math.max(0, this.player.x - this.player.speed);
        }
        if (this.keys['ArrowRight'] || this.keys['d']) {
            this.player.x = Math.min(this.canvas.width - this.player.width, 
                                   this.player.x + this.player.speed);
        }
        if ((this.keys[' '] || this.keys['Spacebar']) && !this.keys['_space']) {
            this.shoot();
            this.keys['_space'] = true;
        }
        if (!this.keys[' '] && !this.keys['Spacebar']) {
            delete this.keys['_space'];
        }
        if (this.keys['r'] && !this.keys['_r']) {
            this.start();
            this.keys['_r'] = true;
        }
        if (!this.keys['r']) {
            delete this.keys['_r'];
        }
    }
    
    shoot() {
        if (this.bullets.length < 3) { // Limit bullets
            this.bullets.push({
                x: this.player.x + this.player.width / 2,
                y: this.player.y,
                width: 4,
                height: 10
            });
            this.sounds.shoot.play();
        }
    }
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].y -= this.bulletSpeed;
            
            // Remove bullets that are off screen
            if (this.bullets[i].y < 0) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Check collisions with enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (!enemy.alive) continue;
                
                if (this.checkCollision(this.bullets[i], enemy)) {
                    enemy.alive = false;
                    this.bullets.splice(i, 1);
                    this.score += 100;
                    this.sounds.explode.play();
                    
                    // Check if all enemies are destroyed
                    if (this.enemies.every(e => !e.alive)) {
                        this.levelUp();
                    }
                    
                    this.updateUI();
                    break;
                }
            }
        }
    }
    
    updateEnemies() {
        let moveDown = false;
        
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            
            enemy.x += this.enemySpeed * this.enemyDirection;
            
            // Check if enemy hits the edge
            if (enemy.x <= 0 || enemy.x + enemy.width >= this.canvas.width) {
                moveDown = true;
            }
            
            // Check if enemy reaches the player
            if (enemy.y + enemy.height >= this.player.y) {
                this.gameOver();
                return;
            }
        }
        
        if (moveDown) {
            this.enemyDirection *= -1;
            for (const enemy of this.enemies) {
                if (enemy.alive) {
                    enemy.y += 20;
                }
            }
        }
    }
    
    levelUp() {
        this.level++;
        this.enemySpeed += 0.5;
        this.createEnemies();
        
        // Increase player speed slightly
        this.player.speed = Math.min(this.player.speed + 0.5, 10);
        
        // Flash effect for level up
        this.ctx.fillStyle = 'rgba(76, 209, 55, 0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Display level up message
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`LEVEL ${this.level}`, this.canvas.width / 2, this.canvas.height / 2);
        
        this.updateUI();
    }
    
    gameOver() {
        this.isRunning = false;
        
        // Display game over
        this.ctx.fillStyle = 'rgba(255, 107, 107, 0.8)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
        
        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
    
    checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.drawBackground();
        
        // Draw game objects
        this.drawPlayer();
        this.drawBullets();
        this.drawEnemies();
        
        // Draw HUD
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 10, 20);
        this.ctx.fillText(`Lives: ${this.lives}`, 10, 40);
        this.ctx.fillText(`Level: ${this.level}`, 10, 60);
        
        if (this.isPaused) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        }
    }
    
    gameLoop() {
        if (!this.isRunning || this.isPaused) return;
        
        // Update game state
        this.updatePlayer();
        this.updateBullets();
        this.updateEnemies();
        
        // Draw everything
        this.draw();
        
        // Continue game loop
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Initialize game
const game = new Game();

// Global functions for buttons
function startGame() {
    game.start();
    document.getElementById('startBtn').disabled = true;
    setTimeout(() => {
        document.getElementById('startBtn').disabled = false;
    }, 1000);
}

function togglePause() {
    game.togglePause();
}

function toggleSound() {
    game.toggleSound();
}

// Auto-start for testing
window.onload = () => {
    // Uncomment to auto-start the game
    // startGame();
};
