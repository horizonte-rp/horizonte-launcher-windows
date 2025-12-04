/**
 * VM Detector Service
 * Detecta se o sistema está rodando em uma máquina virtual
 */

const { execSync } = require('child_process');
const os = require('os');

class VMDetectorService {
    constructor() {
        // Fabricantes conhecidos de VMs
        this.vmManufacturers = [
            'vmware',
            'virtualbox',
            'oracle',
            'qemu',
            'xen',
            'hyper-v',
            'microsoft corporation', // Hyper-V
            'parallels',
            'innotek',
            'kvm',
            'bochs',
            'virtual machine'
        ];

        // Prefixos MAC de VMs conhecidas
        this.vmMacPrefixes = [
            '00:0C:29', // VMware
            '00:50:56', // VMware
            '00:05:69', // VMware
            '00:1C:14', // VMware
            '08:00:27', // VirtualBox
            '0A:00:27', // VirtualBox
            '00:03:FF', // Hyper-V
            '00:15:5D', // Hyper-V
            '52:54:00', // QEMU/KVM
            '00:16:3E', // Xen
            '00:1A:4A', // Parallels
        ];

        // Processos de VMs
        this.vmProcesses = [
            'vmtoolsd.exe',
            'vmwaretray.exe',
            'vmwareuser.exe',
            'VBoxService.exe',
            'VBoxTray.exe',
            'qemu-ga.exe',
            'prl_tools.exe',
            'prl_cc.exe',
            'xenservice.exe'
        ];

        // Drivers de VMs
        this.vmDrivers = [
            'vmmouse.sys',
            'vmhgfs.sys',
            'vboxguest.sys',
            'vboxmouse.sys',
            'vboxsf.sys',
            'vboxvideo.sys',
            'vioscsi.sys',
            'viostor.sys',
            'balloon.sys'
        ];

        // Nomes de disco que indicam VM
        this.vmDiskNames = [
            'vbox',
            'vmware',
            'virtual',
            'qemu',
            'harddisk'
        ];
    }

    /**
     * Executa comando e retorna resultado
     */
    execCommand(command) {
        try {
            return execSync(command, {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 10000
            }).toLowerCase();
        } catch (error) {
            return '';
        }
    }

    /**
     * Verifica fabricante da placa-mãe
     */
    checkManufacturer() {
        const result = {
            detected: false,
            manufacturer: '',
            reason: ''
        };

        try {
            const manufacturer = this.execCommand('wmic baseboard get Manufacturer');
            const product = this.execCommand('wmic baseboard get Product');
            const systemManufacturer = this.execCommand('wmic computersystem get Manufacturer');

            const combined = `${manufacturer} ${product} ${systemManufacturer}`.toLowerCase();

            for (const vm of this.vmManufacturers) {
                if (combined.includes(vm)) {
                    result.detected = true;
                    result.manufacturer = vm;
                    result.reason = `Fabricante de VM detectado: ${vm}`;
                    break;
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar fabricante:', error.message);
        }

        return result;
    }

    /**
     * Verifica MAC Address
     */
    checkMacAddress() {
        const result = {
            detected: false,
            mac: '',
            reason: ''
        };

        try {
            const interfaces = os.networkInterfaces();

            for (const [name, addrs] of Object.entries(interfaces)) {
                for (const addr of addrs) {
                    if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
                        const macUpper = addr.mac.toUpperCase();
                        const macPrefix = macUpper.substring(0, 8);

                        for (const vmPrefix of this.vmMacPrefixes) {
                            if (macPrefix === vmPrefix) {
                                result.detected = true;
                                result.mac = macUpper;
                                result.reason = `MAC Address de VM detectado: ${macPrefix}`;
                                return result;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar MAC:', error.message);
        }

        return result;
    }

    /**
     * Verifica processos de VM rodando
     */
    checkProcesses() {
        const result = {
            detected: false,
            process: '',
            reason: ''
        };

        try {
            const taskList = this.execCommand('tasklist /FO CSV');

            for (const proc of this.vmProcesses) {
                if (taskList.includes(proc.toLowerCase())) {
                    result.detected = true;
                    result.process = proc;
                    result.reason = `Processo de VM detectado: ${proc}`;
                    break;
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar processos:', error.message);
        }

        return result;
    }

    /**
     * Verifica drivers de VM instalados
     */
    checkDrivers() {
        const result = {
            detected: false,
            driver: '',
            reason: ''
        };

        try {
            const drivers = this.execCommand('driverquery /FO CSV');

            for (const driver of this.vmDrivers) {
                if (drivers.includes(driver.toLowerCase().replace('.sys', ''))) {
                    result.detected = true;
                    result.driver = driver;
                    result.reason = `Driver de VM detectado: ${driver}`;
                    break;
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar drivers:', error.message);
        }

        return result;
    }

    /**
     * Verifica chaves de registro específicas de VM
     */
    checkRegistry() {
        const result = {
            detected: false,
            key: '',
            reason: ''
        };

        const registryKeys = [
            'HKLM\\SOFTWARE\\VMware, Inc.\\VMware Tools',
            'HKLM\\SOFTWARE\\Oracle\\VirtualBox Guest Additions',
            'HKLM\\SOFTWARE\\Microsoft\\Virtual Machine\\Guest\\Parameters',
            'HKLM\\HARDWARE\\ACPI\\DSDT\\VBOX__',
            'HKLM\\HARDWARE\\ACPI\\FADT\\VBOX__'
        ];

        for (const key of registryKeys) {
            try {
                this.execCommand(`reg query "${key}" 2>nul`);
                // Se não der erro, a chave existe
                result.detected = true;
                result.key = key;
                result.reason = `Chave de registro de VM encontrada: ${key}`;
                break;
            } catch (error) {
                // Chave não existe, continua
            }
        }

        return result;
    }

    /**
     * Verifica nome do disco
     */
    checkDiskName() {
        const result = {
            detected: false,
            diskName: '',
            reason: ''
        };

        try {
            const diskModel = this.execCommand('wmic diskdrive get Model');

            for (const vmName of this.vmDiskNames) {
                if (diskModel.includes(vmName)) {
                    result.detected = true;
                    result.diskName = vmName;
                    result.reason = `Nome de disco de VM detectado: ${vmName}`;
                    break;
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar disco:', error.message);
        }

        return result;
    }

    /**
     * Verifica recursos suspeitos (muito baixos)
     */
    checkResources() {
        const result = {
            detected: false,
            reason: ''
        };

        try {
            const totalRAM = os.totalmem() / (1024 * 1024 * 1024); // GB
            const cpuCount = os.cpus().length;

            // VMs frequentemente têm recursos limitados
            // Mas isso pode dar falsos positivos em PCs antigos
            if (totalRAM <= 2 && cpuCount <= 2) {
                result.detected = true;
                result.reason = `Recursos muito limitados (RAM: ${totalRAM.toFixed(1)}GB, CPUs: ${cpuCount})`;
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar recursos:', error.message);
        }

        return result;
    }

    /**
     * Verifica modelo do BIOS
     */
    checkBIOS() {
        const result = {
            detected: false,
            bios: '',
            reason: ''
        };

        try {
            const biosVersion = this.execCommand('wmic bios get SMBIOSBIOSVersion');
            const biosVendor = this.execCommand('wmic bios get Manufacturer');
            const combined = `${biosVersion} ${biosVendor}`.toLowerCase();

            const vmBiosIndicators = ['vbox', 'vmware', 'qemu', 'virtual', 'xen', 'bochs', 'seabios'];

            for (const indicator of vmBiosIndicators) {
                if (combined.includes(indicator)) {
                    result.detected = true;
                    result.bios = indicator;
                    result.reason = `BIOS de VM detectado: ${indicator}`;
                    break;
                }
            }
        } catch (error) {
            console.error('[VMDetector] Erro ao verificar BIOS:', error.message);
        }

        return result;
    }

    /**
     * Executa todas as verificações
     * @returns {Object} Resultado completo da detecção
     */
    detect() {
        const checks = {
            manufacturer: this.checkManufacturer(),
            macAddress: this.checkMacAddress(),
            processes: this.checkProcesses(),
            drivers: this.checkDrivers(),
            registry: this.checkRegistry(),
            diskName: this.checkDiskName(),
            bios: this.checkBIOS(),
            resources: this.checkResources()
        };

        // Conta quantas verificações detectaram VM
        const detections = Object.values(checks).filter(c => c.detected);
        const isVM = detections.length >= 2; // Precisa de pelo menos 2 indicadores

        // Coleta todas as razões
        const reasons = detections.map(d => d.reason).filter(r => r);

        const result = {
            isVM: isVM,
            confidence: detections.length,
            maxConfidence: Object.keys(checks).length,
            reasons: reasons,
            checks: checks,
            detectedAt: new Date().toISOString()
        };

        return result;
    }

    /**
     * Verificação rápida (apenas os métodos mais confiáveis)
     */
    quickCheck() {
        const manufacturer = this.checkManufacturer();
        const macAddress = this.checkMacAddress();
        const processes = this.checkProcesses();

        const detections = [manufacturer, macAddress, processes].filter(c => c.detected);

        return {
            isVM: detections.length >= 1,
            confidence: detections.length,
            reasons: detections.map(d => d.reason).filter(r => r)
        };
    }
}

// Exporta instância única (singleton)
module.exports = new VMDetectorService();
