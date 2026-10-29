# Mello PC Diagnostic

Aplicativo local de diagnóstico com interface em português, inspirado na referência fornecida: fundo escuro, indicadores verdes/cianos e abas Sistema, Armazenamento, Drivers, Memória RAM e Temperatura. Inclui coleta nativa por Node.js e uma interface React responsiva. **Não existe aplicação Laravel neste repositório.**

## Executar no seu computador

Requer **Node.js 22 ou superior** e npm. Depois de baixar o projeto:

```bash
npm ci
npm run build
npm run app
```

O último comando inicia o coletor e abre a interface no navegador padrão. Mantenha o terminal aberto; Ctrl+C encerra o servidor. Também é possível abrir `Iniciar Mello Windows.cmd` no Windows ou executar `bash "Iniciar Mello macOS.command"` no Mac. Na primeira execução é necessária conexão para instalar as dependências. O programa compilado usa fontes e recursos locais, sem CDN e sem telemetria.

`npm start` inicia somente o servidor, sem abrir o navegador. `npm run app -- --no-open` testa o inicializador sem abrir uma janela. `npm run dev` inicia a interface Vite na porta 5173 e o coletor na porta 4318. O coletor aceita apenas endereços de loopback. Não exponha o servidor Vite de desenvolvimento a redes não confiáveis.

**As informações pertencem à máquina que executa o coletor.** Abrir uma interface hospedada na nuvem não dá acesso ao hardware do PC ou Mac do visitante. O modo demonstração usa dados ilustrativos identificados na tela e nos relatórios; não executa testes nem consultas reais.

## O que cada aba faz

| Aba           | Recursos e limites                                                                                                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sistema       | CPU, sistema operacional/build, uptime, placa-mãe, firmware, memória, GPU, monitores, rede/IP/MAC, USB, processos e usuário da sessão, conforme a plataforma permitir. Atualização automática a cada 5, 10 ou 30 segundos, com pausa.                                                                                   |
| Armazenamento | Discos, volumes, espaço e atributos SMART acessíveis. Desgaste NVMe, total gravado NVMe, temperatura, ciclos e horas de uso quando reportados. Indicadores SMART recebem o horário da varredura; não são relidos a cada atualização da CPU. SATA só recebe percentual quando o atributo de vida restante é reconhecido. |
| Drivers       | Windows: inventário Win32_PnPSignedDriver e consulta de ofertas do Windows Update. macOS: extensões legadas reportadas pelo system_profiler. Linux: módulos de /sys/module, incluindo versão própria quando disponível.                                                                                                 |
| RAM           | Inventário, uso, swap e teste de 6 padrões sobre até 64 MiB alocados pelo processo. Pode abrir o utilitário de memória do Windows mediante confirmação. No Mac, orienta como iniciar o Diagnóstico Apple.                                                                                                               |
| Temperatura   | Sensores de CPU/núcleos, GPU, discos SMART e sensores adicionais reportados pelo sistema, quando acessíveis. Histórico das leituras da sessão.                                                                                                                                                                          |

Não é possível coletar literalmente todas as informações em todos os dispositivos. A interface preserva leituras indisponíveis em vez de produzir valores fictícios. Identificar RAM não comprova integridade; listar um driver não comprova que a versão é a mais recente. Não há score de saúde arbitrário.

### SMART e vida útil

Instale **smartmontools** e deixe `smartctl` disponível no PATH para ampliar as leituras da varredura completa:

- macOS com Homebrew: `brew install smartmontools`.
- Windows: instalador oficial do smartmontools; inclua a pasta do executável no PATH.
- Linux: pacote `smartmontools` da distribuição.

Alguns dispositivos, bridges USB e controladores RAID não expõem SMART. A leitura pode exigir permissões elevadas; o programa não eleva privilégios automaticamente. No Windows também consulta `Get-PhysicalDisk` e `Get-StorageReliabilityCounter` como alternativa.

Porcentagem de desgaste representa o indicador do fabricante, **não uma garantia de duração**. Dias restantes de vida aparecem como não estimáveis: SMART não permite prever uma data de falha confiável. O tempo já ligado é exibido separadamente. Não há estimativa de bytes SATA baseada em unidades desconhecidas do fabricante. A varredura apenas lê os indicadores; não apaga dados nem executa testes destrutivos.

### Temperaturas

O Windows pode precisar do **Libre Hardware Monitor** ou **Open Hardware Monitor** em execução para publicar sensores em WMI. O coletor lê os namespaces correspondentes quando disponíveis, sem baixar nem instalar drivers de kernel. Sensores não publicados pelo firmware permanecem indisponíveis. No Mac, principalmente Apple Silicon, a API padrão pode não expor temperaturas; não foi implementado um driver proprietário de sensores. Limites seguros dependem do modelo e não são inferidos de uma faixa universal.

### Drivers no Windows e macOS

A consulta ao Windows Update é somente leitura e pode demorar até 90 segundos. Ofertas com hardware ID correspondente são sinalizadas; ausência de oferta não certifica que todos os drivers estão atualizados. Não há instalação automática. A rede externa só é usada nessa consulta solicitada pelo usuário.

No macOS, drivers integrados acompanham a atualização do sistema. Confira Ajustes do Sistema → Geral → Atualização de Software e o suporte do fabricante para extensões de terceiros. O inventário de extensões legadas não inclui necessariamente DriverKit/system extensions modernos nem drivers embutidos no kernel.

### Teste de RAM

O teste rápido escreve/verifica zeros, uns, bits alternados e padrões dependentes do endereço, em worker separado. Ele testa somente a região virtual alocada ao processo. **Não substitui MemTest86/MemTest86+ ou o diagnóstico nativo fora do sistema operacional**, não determina a vida útil dos módulos e não certifica toda a RAM. Abrir o utilitário do Windows não agenda reinício automaticamente.

## Relatórios e privacidade

Exportação JSON ou HTML legível; o HTML pode ser impresso/salvo em PDF pelo navegador. Inclui inventário, resultado de RAM e consulta de drivers quando executados e histórico da sessão. A exportação pode conter nome do usuário, IP, MAC e números de série. Revise antes de compartilhar. O programa não envia relatórios a serviços externos.

## Desenvolvimento e validação

```bash
npm run dev
npm test
npm run build
npm run test:browser
```

Os testes de navegador exigem o servidor de desenvolvimento em execução e Chromium. Na máquina de desenvolvimento na nuvem é usado `/usr/bin/chromium`. Em outra instalação, defina `CHROMIUM_PATH` para seu executável ou adapte a configuração do Playwright.

Testes cobrem interpretação SMART/NVMe, indicadores ausentes, alerta de falha, teste real de memória, dados reais do coletor, navegação nas cinco abas, busca/filtro, demonstração, exportação, controles, responsividade e rejeição de requisições de outra origem. Os caminhos específicos de Windows/macOS precisam de validação nesses sistemas físicos; o desenvolvimento na nuvem ocorre em Linux.

## Estrutura

- `src/`: interface React, estilos e inventário de demonstração isolado.
- `server/native.js`: leitura do sistema, SMART e integrações por plataforma.
- `server/health.js`: interpretação de indicadores sem prognósticos fictícios.
- `server/ram-worker.js`: teste limitado de memória fora da thread principal.
- `server/index.js`: API local e distribuição da interface compilada.
- `scripts/launch.mjs`: inicialização e abertura do navegador.

Este projeto é uma primeira versão funcional de um programa local; não inclui instalador assinado ou executável desktop independente do Node.js.
