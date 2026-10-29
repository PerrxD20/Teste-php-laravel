Mello PC Diagnostic 1.2.0 — sensores incorporados e diagnóstico SMART ampliado.

- Coletor próprio baseado na LibreHardwareMonitorLib 0.9.6, com runtime .NET incluído. Não é necessário manter o Libre Hardware Monitor aberto nem instalar .NET separadamente.
- Temperatura por componente/núcleo quando disponível, mínimo/máximo, ventoinhas, tensões e outros sensores expostos pelo equipamento.
- Para sensores que dependem de PawnIO, botão com confirmação para baixar o instalador oficial assinado e abrir a instalação normal do Windows. Não ocorre instalação silenciosa ou automática de drivers; a assinatura e o SHA-256 são verificados antes da execução. É necessária internet para esse download opcional e permissões adequadas para leitura do hardware.
- smartmontools 7.5 e banco de modelos incluídos no aplicativo. Varredura somente de leitura para SMART/NVMe/SATA/SCSI acessível, alertas, erros de mídia, reserva disponível, setores pendentes/realocados, desgaste nominal e histórico.
- Estado do firmware, leitura parcial, avisos e falha crítica apresentados separadamente. A porcentagem de vida só aparece quando há indicador reconhecido do fabricante/padrão. Não há previsão inventada de dias restantes.
- GPL/MPL e demais licenças/avisos e fontes correspondentes dos componentes distribuídos incluídos. O código-fonte smartmontools também está disponível como arquivo separado nesta release.

Windows 10/11 x64. **Setup** instala, cria atalhos e desinstalador; **Portable** abre sem instalação. Os executáveis não têm assinatura digital de editor; o Windows pode mostrar editor desconhecido. Os hashes publicados permitem conferir a integridade dos arquivos.

A cobertura depende dos sensores, firmware, controladores USB/RAID, dispositivos e permissões. A avaliação do Mello não reproduz o algoritmo de avaliação de outros programas nem garante uma data de falha. Mantenha backups dos dados importantes. O teste de RAM permanece limitado à região alocada pelo processo.
