/**
 * HWID (Hardware ID) Service
 * Coleta identificadores únicos de hardware para identificação do dispositivo
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

class HWIDService {
    constructor() {
        this.cache = null;
        this.cacheTime = null;
        this.cacheDuration = 5 * 60 * 1000; // 5 minutos
    }

    /**
     * Executa comando WMI e retorna o resultado
     * @param {string} query - Query WMI
     * @returns {string} - Resultado do comando
     */
    executeWMIC(query) {
        try {
            const result = execSync(`wmic ${query}`, {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 10000
            });
            // Remove linhas vazias e espaços
            const cleaned = result.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.toLowerCase().includes('uuid') &&
                               !line.toLowerCase().includes('serialnumber') &&
                               !line.toLowerCase().includes('macaddress') &&
                               !line.toLowerCase().includes('caption') &&
                               !line.toLowerCase().includes('manufacturer') &&
                               !line.toLowerCase().includes('processorid'))
                .join('')
                .trim();
            return cleaned;
        } catch (error) {
            return '';
        }
    }

    /**
     * Executa comando PowerShell (fallback para Windows 11)
     * @param {string} command - Comando PowerShell
     * @returns {string} - Resultado do comando
     */
    executePowerShell(command) {
        try {
            const result = execSync(`powershell -Command "${command}"`, {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 10000
            }).trim();
            return result;
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém UUID da placa-mãe
     * Mais confiável, difícil de spoofar
     */
    getMotherboardUUID() {
        try {
            // Tentar WMIC primeiro
            let uuid = this.executeWMIC('csproduct get UUID');

            // Se falhar, tentar PowerShell
            if (!uuid) {
                uuid = this.executePowerShell('(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID');
            }

            return uuid || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém serial do disco principal (C:)
     */
    getDiskSerial() {
        try {
            let serial = this.executeWMIC('diskdrive get SerialNumber');

            if (!serial) {
                serial = this.executePowerShell('(Get-PhysicalDisk | Select-Object -First 1).SerialNumber');
            }

            return serial || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém serial do BIOS
     */
    getBIOSSerial() {
        try {
            let serial = this.executeWMIC('bios get SerialNumber');

            if (!serial) {
                serial = this.executePowerShell('(Get-CimInstance -ClassName Win32_BIOS).SerialNumber');
            }

            return serial || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém MAC Address da primeira interface de rede física
     */
    getMACAddress() {
        try {
            let mac = this.executeWMIC('nic where "PhysicalAdapter=true" get MACAddress');

            if (!mac) {
                mac = this.executePowerShell('(Get-NetAdapter -Physical | Where-Object Status -eq Up | Select-Object -First 1).MacAddress');
            }

            // Pega apenas o primeiro MAC (pode ter múltiplas interfaces)
            if (mac) {
                const macs = mac.split(/\s+/).filter(m => m.includes(':') || m.includes('-'));
                return macs[0] ? macs[0].replace(/[-:]/g, '') : '';
            }
            return '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém ID do processador
     */
    getProcessorId() {
        try {
            let processorId = this.executeWMIC('cpu get ProcessorId');

            if (!processorId) {
                processorId = this.executePowerShell('(Get-CimInstance -ClassName Win32_Processor).ProcessorId');
            }

            return processorId || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Obtém nome do fabricante da placa-mãe (útil para detectar VMs)
     */
    getMotherboardManufacturer() {
        try {
            let manufacturer = this.executeWMIC('baseboard get Manufacturer');

            if (!manufacturer) {
                manufacturer = this.executePowerShell('(Get-CimInstance -ClassName Win32_BaseBoard).Manufacturer');
            }

            return manufacturer || '';
        } catch (error) {
            return '';
        }
    }

    /**
     * Coleta todos os identificadores de hardware
     * @returns {Object} - Objeto com todos os identificadores
     */
    collectAll() {
        const data = {
            motherboardUUID: this.getMotherboardUUID(),
            diskSerial: this.getDiskSerial(),
            biosSerial: this.getBIOSSerial(),
            macAddress: this.getMACAddress(),
            processorId: this.getProcessorId(),
            manufacturer: this.getMotherboardManufacturer()
        };

        return data;
    }

    /**
     * Gera hash HWID único combinando todos os identificadores
     * @returns {string} - Hash SHA-256 do HWID
     */
    generateHash() {
        // Usar cache se disponível e não expirado
        if (this.cache && this.cacheTime && (Date.now() - this.cacheTime < this.cacheDuration)) {
            return this.cache;
        }

        const data = this.collectAll();

        // Combina apenas os identificadores mais estáveis e difíceis de trocar
        // UUID da placa-mãe + ProcessorId (ideal para banimento)
        const components = [
            data.motherboardUUID,
            data.processorId
        ].filter(c => c); // Remove valores vazios

        if (components.length === 0) {
            console.error('[HWID] Nenhum identificador de hardware encontrado!');
            return null;
        }

        // Gera hash SHA-256
        const combined = components.join('|');
        const hash = crypto.createHash('sha256').update(combined).digest('hex');

        // Salva no cache
        this.cache = hash;
        this.cacheTime = Date.now();

        return hash;
    }

    /**
     * Obtém HWID com metadados
     * @returns {Object} - Objeto com hash e metadados
     */
    getHWID() {
        const hash = this.generateHash();
        const data = this.collectAll();

        return {
            hash: hash,
            components: {
                hasMotherboard: !!data.motherboardUUID,
                hasCPU: !!data.processorId
            },
            manufacturer: data.manufacturer,
            collectedAt: new Date().toISOString()
        };
    }

    /**
     * Limpa o cache forçando nova coleta
     */
    clearCache() {
        this.cache = null;
        this.cacheTime = null;
    }
}

// Exporta instância única (singleton)
module.exports = new HWIDService();
