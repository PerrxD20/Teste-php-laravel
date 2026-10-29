# smartmontools incorporado ao Mello

O Mello distribui o executável de linha de comando **smartctl 7.5, revisão 5714, Windows x64**, do projeto smartmontools, e o banco de dispositivos `drivedb.h`. Esses arquivos são extraídos sem alteração do instalador oficial e verificados por SHA-256. O serviço smartd, scripts de atualização, outros utilitários e a versão de 32 bits não são instalados pelo Mello.

smartmontools é software de terceiros sob **GNU GPL versão 2 ou posterior** (`GPL-2.0-or-later`). A licença integral está em `COPYING.txt`; autores, informações do projeto e instruções originais de compilação estão em `AUTHORS.txt`, `README.txt` e `INSTALL.txt` nesta mesma pasta da distribuição. smartctl é executado como processo separado; o Mello lê sua saída JSON.

## Código-fonte correspondente incluído

O arquivo **`source/smartmontools-7.5.tar.gz`**, incluído junto ao componente em cada instalação e distribuição portátil, contém o código-fonte completo original da versão incorporada, incluindo os scripts de configuração, Makefiles e instruções de compilação para Windows/MinGW. Consulte `INSTALL` no arquivo-fonte (seção “Guidelines for Windows”). Não foi feita alteração no código-fonte ou no binário smartctl. O arquivo do banco de dispositivos distribuído também permanece disponível em formato-fonte como `drivedb.h`.

Não é necessário solicitar o código nem acessar um serviço externo para obtê-lo: ele acompanha o executável. A cópia está em `resources/native/smartctl/source/` na pasta instalada. A distribuição portátil extrai a mesma árvore durante a execução.

Fontes oficiais e os hashes de integridade estão em `UPSTREAM.json`. As permissões concedidas pela GPL para esse componente são preservadas; esta nota não substitui a licença.

Copyright © 2002–2025, Bruce Allen, Christian Franke e demais autores do projeto smartmontools. Veja o arquivo `AUTHORS.txt` para os créditos originais completos.

## Limites de acesso e uso pelo Mello

Incorporar smartctl não remove restrições de acesso impostas pelo Windows, por controladores RAID/USB ou pelo firmware. Algumas leituras exigem que o usuário inicie o Mello com privilégios administrativos. O Mello não eleva privilégios automaticamente e não utiliza smartctl para apagar dados, alterar configurações SMART, instalar serviços ou iniciar testes de gravação.
