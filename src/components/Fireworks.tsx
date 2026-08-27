import React, { useEffect, useRef } from 'react';

// Highly optimized Canvas-based Firework Simulation with realistic physics
export function FireworksBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Handle resizing beautifully
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const colors = [
      '#FF1268', // Vibrant Pink / Crimson Pink
      '#00F4FF', // Cyan / Sky Blue
      '#FFBF00', // Gold Dust Yellow
      '#00FF7F', // Vivid Emerald Green
      '#8A2BE2', // Deep Orchid Violet
      '#FF8200', // Solar Tangerine Orange
      '#FFFFFF', // Bright White Starlight
    ];

    class SparkleTrail {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      decay: number;
      size: number;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        // Trail particles drift slightly downwards
        this.vx = (Math.random() - 0.5) * 0.8;
        this.vy = Math.random() * 0.6 + 0.2;
        this.color = color;
        this.alpha = 0.9;
        this.decay = Math.random() * 0.05 + 0.04;
        this.size = Math.random() * 1.5 + 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.globalAlpha = this.alpha;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.shadowBlur = this.size * 2;
        c.shadowColor = this.color;
        c.fill();
        c.restore();
      }
    }

    class FireworkParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      decay: number;
      gravity: number;
      resistance: number;
      size: number;
      trail: { x: number; y: number }[];
      maxTrailLength: number;

      constructor(x: number, y: number, color: string) {
        this.x = x;
        this.y = y;
        
        // Circular explosive launch velocity
        const angle = Math.random() * Math.PI * 2;
        // High blast speed for huge scattering effect (8 to 15px per frame)
        const speed = Math.random() * 8 + 6;
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.color = color;
        this.alpha = 1.0;
        // Slower decay so the sparkle remains visibe throughout the descent
        this.decay = Math.random() * 0.015 + 0.012; 
        this.gravity = 0.12; // slow drift downwards
        this.resistance = 0.96; // air drag
        this.size = Math.random() * 3 + 2; // bigger glowing flower stars
        this.trail = [];
        this.maxTrailLength = 5;
      }

      update() {
        // Record trail coordinates
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
          this.trail.shift();
        }

        // Apply physical properties
        this.vx *= this.resistance;
        this.vy *= this.resistance;
        this.vy += this.gravity;
        
        this.x += this.vx;
        this.y += this.vy;
        
        this.alpha -= this.decay;
      }

      draw(c: CanvasRenderingContext2D) {
        if (this.alpha <= 0) return;

        c.save();
        
        // Draw elegant trailing spark tail
        if (this.trail.length > 1) {
          c.beginPath();
          c.moveTo(this.trail[0].x, this.trail[0].y);
          for (let i = 1; i < this.trail.length; i++) {
            c.lineTo(this.trail[i].x, this.trail[i].y);
          }
          c.strokeStyle = this.color;
          c.lineWidth = this.size * 0.5;
          c.globalAlpha = this.alpha * 0.4;
          c.stroke();
        }

        // Main star particle
        c.globalAlpha = this.alpha;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fillStyle = this.color;
        
        // Intense bloom glow effect
        c.shadowBlur = this.size * 3;
        c.shadowColor = this.color;
        
        c.fill();
        c.restore();
      }
    }

    class FireworkRocket {
      startX: number;
      startY: number;
      targetX: number;
      targetY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      exploded: boolean;
      trail: { x: number; y: number }[];
      maxTrailLength: number;
      speed: number;

      constructor() {
        this.startX = Math.random() * (width - 160) + 80;
        this.startY = height + 10;
        
        // Target random sky coordinate
        this.targetX = Math.random() * (width - 240) + 120;
        this.targetY = Math.random() * (height * 0.5) + height * 0.15; // Upper half of the container
        
        this.x = this.startX;
        this.y = this.startY;
        
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.exploded = false;
        
        this.trail = [];
        this.maxTrailLength = 10;
        this.speed = 0.08; // smooth interpolation speed
      }

      update(spawnExplosion: (x: number, y: number, color: string) => void, trails: SparkleTrail[]) {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
          this.trail.shift();
        }

        // Add orange/yellow shooting spark tail embers during ascent
        if (Math.random() < 0.7) {
          trails.push(new SparkleTrail(this.x, this.y, '#FFAA00'));
        }

        // Lift using logarithmic ease-in towards the targets
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        
        this.x += dx * this.speed;
        this.y += dy * this.speed;

        // If very close to zenith target position, pop!
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          this.exploded = true;
          spawnExplosion(this.x, this.y, this.color);
        }
      }

      draw(c: CanvasRenderingContext2D) {
        if (this.exploded) return;

        c.save();
        
        // Draw rocket tail line
        if (this.trail.length > 1) {
          c.beginPath();
          c.moveTo(this.trail[0].x, this.trail[0].y);
          for (let i = 1; i < this.trail.length; i++) {
            c.lineTo(this.trail[i].x, this.trail[i].y);
          }
          c.strokeStyle = '#FFFFFF';
          c.lineWidth = 2.5;
          c.shadowBlur = 10;
          c.shadowColor = '#FFAA00';
          c.stroke();
        }

        // Bright tip head
        c.beginPath();
        c.arc(this.x, this.y, 4, 0, Math.PI * 2);
        c.fillStyle = '#FFFFFF';
        c.fill();
        c.restore();
      }
    }

    const rockets: FireworkRocket[] = [];
    const particles: FireworkParticle[] = [];
    const sparkleTrails: SparkleTrail[] = [];

    const triggerExplosionFromPeak = (x: number, y: number, color: string) => {
      // 40 to 60 dense particles for huge star flower blooms (මල් වෙඩි)
      const count = Math.floor(Math.random() * 20) + 40;
      for (let i = 0; i < count; i++) {
        particles.push(new FireworkParticle(x, y, color));
      }

      // Add a couple of white core sparkles for high initial bright light
      for (let j = 0; j < 12; j++) {
        const whiteSpark = new FireworkParticle(x, y, '#FFFFFF');
        whiteSpark.vx *= 1.3; // white cores scatter outer
        whiteSpark.vy *= 1.3;
        particles.push(whiteSpark);
      }
    };

    // Auto launch system
    let nextLaunchTime = 0;

    const animate = (timestamp: number) => {
      // Create a fading layer to preserve stunning bright long particle tails
      ctx.fillStyle = 'rgba(10, 15, 28, 0.18)'; 
      ctx.fillRect(0, 0, width, height);

      // Launch rocket at intervals
      if (timestamp > nextLaunchTime) {
        rockets.push(new FireworkRocket());
        // Fast, massive pacing: launch rocket every 350 to 750 milliseconds
        nextLaunchTime = timestamp + Math.random() * 400 + 350;
      }

      // Update & Draw Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.update(triggerExplosionFromPeak, sparkleTrails);
        r.draw(ctx);
        if (r.exploded) {
          rockets.splice(i, 1);
        }
      }

      // Update & Draw Sparks
      for (let i = sparkleTrails.length - 1; i >= 0; i--) {
        const trail = sparkleTrails[i];
        trail.update();
        trail.draw(ctx);
        if (trail.alpha <= 0) {
          sparkleTrails.splice(i, 1);
        }
      }

      // Update & Draw Blast flower stars
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0"
      style={{ display: 'block', background: 'transparent' }}
    />
  );
}
