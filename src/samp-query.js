const dgram = require('dgram');

// Cache global para armazenar último resultado válido de cada servidor
const serverCache = new Map();

class SampQuery {
    constructor(ip, port) {
        this.ip = ip;
        this.port = parseInt(port);
        this.cacheKey = `${ip}:${port}`;
    }

    createPacket(payload) {
        const ipParts = this.ip.split('.').map(Number);
        const packet = Buffer.alloc(10 + payload.length);

        packet.write('SAMP', 0);
        packet[4] = ipParts[0];
        packet[5] = ipParts[1];
        packet[6] = ipParts[2];
        packet[7] = ipParts[3];
        packet[8] = this.port & 0xFF;
        packet[9] = (this.port >> 8) & 0xFF;
        packet.write(payload, 10);

        return packet;
    }

    toInteger(buffer) {
        if (!buffer || buffer.length === 0) return 0;

        let integer = 0;
        integer += buffer[0];

        if (buffer.length > 1) {
            integer += (buffer[1] << 8);
        }

        if (buffer.length > 2) {
            integer += (buffer[2] << 16);
        }

        if (buffer.length > 3) {
            integer += (buffer[3] << 24);
        }

        if (integer >= 4294967294) {
            integer -= 4294967296;
        }

        return integer;
    }

    // Tentativa única de query
    async _singleQuery() {
        return new Promise((resolve) => {
            const client = dgram.createSocket('udp4');
            const packet = this.createPacket('i');

            const timeout = setTimeout(() => {
                client.close();
                resolve(null); // null indica falha
            }, 2500);

            client.on('message', (response) => {
                clearTimeout(timeout);
                client.close();

                try {
                    let offset = 11;
                    offset += 1; // password flag

                    const players = this.toInteger(response.slice(offset, offset + 2));
                    offset += 2;

                    const maxPlayers = this.toInteger(response.slice(offset, offset + 2));
                    offset += 2;

                    const hostnameLen = response[offset];
                    offset += 4;
                    const hostname = response.slice(offset, offset + hostnameLen).toString();
                    offset += hostnameLen;

                    const gamemodeLen = response[offset];
                    offset += 4;
                    const gamemode = response.slice(offset, offset + gamemodeLen).toString();
                    offset += gamemodeLen;

                    const mapnameLen = response[offset];
                    offset += 4;
                    const mapname = response.slice(offset, offset + mapnameLen).toString();

                    resolve({
                        online: true,
                        players: players,
                        maxPlayers: maxPlayers,
                        hostname: hostname,
                        gamemode: gamemode,
                        mapname: mapname
                    });
                } catch (error) {
                    resolve(null);
                }
            });

            client.on('error', () => {
                clearTimeout(timeout);
                client.close();
                resolve(null);
            });

            client.send(packet, this.port, this.ip);
        });
    }

    // Query com retry e cache
    async getInfo() {
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const result = await this._singleQuery();

            if (result !== null) {
                // Sucesso! Atualiza cache e retorna
                serverCache.set(this.cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
                return result;
            }

            // Pequeno delay entre tentativas
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Todas as tentativas falharam - usar cache se disponível e recente (< 60s)
        const cached = serverCache.get(this.cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 60000) {
            return cached.data;
        }

        // Sem cache válido - retorna offline
        return { online: false, players: 0, maxPlayers: 0 };
    }

    async ping() {
        return new Promise((resolve) => {
            const client = dgram.createSocket('udp4');
            const packet = this.createPacket('p4150');

            const timeout = setTimeout(() => {
                client.close();
                resolve(false);
            }, 2500);

            client.on('message', (response) => {
                clearTimeout(timeout);
                client.close();

                if (response.length >= 15) {
                    const responsePayload = response.slice(10, 15).toString();
                    resolve(responsePayload === 'p4150');
                } else {
                    resolve(false);
                }
            });

            client.on('error', () => {
                clearTimeout(timeout);
                client.close();
                resolve(false);
            });

            client.send(packet, this.port, this.ip);
        });
    }

    async getBasicPlayers() {
        return new Promise((resolve) => {
            const client = dgram.createSocket('udp4');
            const packet = this.createPacket('c');

            const timeout = setTimeout(() => {
                client.close();
                resolve([]);
            }, 2500);

            client.on('message', (response) => {
                clearTimeout(timeout);
                client.close();

                try {
                    const players = [];
                    let offset = 11;

                    const playerCount = response[offset] | (response[offset + 1] << 8);
                    offset += 2;

                    for (let i = 0; i < playerCount; i++) {
                        const nicknameLen = response[offset];
                        offset += 1;

                        const nickname = response.slice(offset, offset + nicknameLen).toString();
                        offset += nicknameLen;

                        const score = this.toInteger(response.slice(offset, offset + 4));
                        offset += 4;

                        players.push({ nickname, score });
                    }

                    resolve(players);
                } catch (error) {
                    resolve([]);
                }
            });

            client.on('error', () => {
                clearTimeout(timeout);
                client.close();
                resolve([]);
            });

            client.send(packet, this.port, this.ip);
        });
    }
}

module.exports = SampQuery;