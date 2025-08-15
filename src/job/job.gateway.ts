import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: true, // Para permitir conexiones desde tu frontend Astro
})
export class JobGateway {
  @WebSocketServer()
  server: Server;

  // Mapa para rastrear qué cliente está suscrito a qué jobs
  private jobSubscriptions = new Map<string, string[]>();

  @SubscribeMessage('subscribeToJob')
  handleSubscribeToJob(client: Socket, jobId: string): void {
    // Añadir este cliente a la lista de suscriptores de este job
    const clientId = client.id;
    if (!this.jobSubscriptions.has(jobId)) {
      this.jobSubscriptions.set(jobId, []);
    }
    this.jobSubscriptions.get(jobId).push(clientId);
    
    console.log(`Cliente ${clientId} suscrito al job ${jobId}`);
  }

  // Método que el JobService llamará cuando un job cambie
  notifyJobUpdate(jobId: string, data: any): void {
    // Si hay clientes suscritos a este job, notificarles
    const subscribers = this.jobSubscriptions.get(jobId) || [];
    
    if (subscribers.length) {
      console.log(`Notificando a ${subscribers.length} clientes sobre el job ${jobId}`);
      
      // Emitir evento a todos los suscritos a este job
      this.server.emit(`job:${jobId}`, data);
    }
  }
}
