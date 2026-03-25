import { localtunnel } from 'localtunnel';

export interface TunnelConfig {
  port: number;
  subdomain?: string;
}

export interface TunnelResult {
  url: string;
  port: number;
  subdomain?: string;
}

export class TunnelManager {
  private activeTunnels: Map<string, TunnelResult> = new Map();

  async createTunnel(config: TunnelConfig): Promise<TunnelResult> {
    const tunnelId = `tunnel_${Date.now()}`;
    
    try {
      const tunnel = await localtunnel({
        port: config.port,
        subdomain: config.subdomain,
      });

      const result: TunnelResult = {
        url: tunnel.url,
        port: config.port,
        subdomain: config.subdomain,
      };

      this.activeTunnels.set(tunnelId, result);

      return result;
    } catch (error) {
      throw new Error(`Failed to create tunnel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async closeTunnel(tunnelId: string): Promise<void> {
    const tunnel = this.activeTunnels.get(tunnelId);
    if (tunnel) {
      this.activeTunnels.delete(tunnelId);
      // Note: localtunnel doesn't provide a close method
      // The tunnel will close when the process ends
    }
  }

  getActiveTunnels(): TunnelResult[] {
    return Array.from(this.activeTunnels.values());
  }
}

export function createTunnelManager(): TunnelManager {
  return new TunnelManager();
}
