import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ThrottleService {
  private readonly logger = new Logger(ThrottleService.name);
  private lastRequestTime: number = 0;
  
  // OpenAI GPT-4o-mini: 500 requests per minute = ~8.3 requests per second
  // Usamos un límite conservador de 400 requests per minute para seguridad
  private readonly maxRequestsPerMinute: number = 400;
  
  // Ventana deslizante para controlar el número de peticiones en un minuto
  private requestTimestamps: number[] = [];
  
  // OpenAI no requiere delays entre peticiones, solo respetar rate limits
  private readonly minDelayMs: number = 0;

  /**
   * Implementa throttling para las peticiones a la API de OpenAI
   * OpenAI tiene rate limits generosos (500 req/min para GPT-4o-mini)
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    
    // Limpiar peticiones antiguas (más de 1 minuto)
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < 60000
    );
    
    // Verificar si estamos cerca del límite de OpenAI
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      // Esperar hasta que la primera petición del minuto actual salga de la ventana
      const oldestTimestamp = this.requestTimestamps[0];
      const timeToWait = 60000 - (now - oldestTimestamp) + 100; // +100ms por seguridad
      
      this.logger.log(`OpenAI rate limit approaching. Waiting ${timeToWait}ms to respect limits`);
      await new Promise(resolve => setTimeout(resolve, timeToWait));
      
      // Limpiar peticiones antiguas después de esperar
      const newNow = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => newNow - timestamp < 60000
      );
    }
    
    // OpenAI no requiere delays entre peticiones, solo respetar rate limits
    // Pero mantenemos un delay mínimo opcional para evitar saturar la API
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const delayNeeded = this.minDelayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    // Actualizar y registrar esta petición
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
  }

  /**
   * Notifica que se ha excedido el rate limit (no cuota para OpenAI)
   * @param retryDelaySeconds Tiempo sugerido de espera en segundos
   */
  notifyQuotaExceeded(retryDelaySeconds: number = 45): void {
    // Para OpenAI, esto sería un rate limit, no una cuota
    // OpenAI no tiene cuotas, solo rate limits por minuto
    this.logger.warn(`OpenAI rate limit hit. Suggested retry delay: ${retryDelaySeconds}s`);
    
    // No necesitamos lógica de cuota para OpenAI
    // Solo respetamos los rate limits por minuto
  }
}
