# Conversão de conteúdos e geração de YTYP

O app identifica o conteúdo sem exigir um modo manual. A busca considera arquivos diretamente na pasta escolhida; RPFs dentro de outros RPFs são percorridos.

| Entrada | Saída |
| --- | --- |
| Veículos com vehicles.meta | Conversor de veículos existente, com spawns, metas unificados e tuning |
| Roupas freemode | stream com prefixos de coleção, YMT preservado e ShopPedApparel registrado |
| Mapas / interiores | stream, this_is_a_map e registro de cada YTYP |
| Props YDR sem YTYP | YTYP básico gerado a partir dos limites reais dos drawables |
| Animações / texturas | Recurso de streaming, preservando os arquivos |
| Peds com peds.meta | PED_METADATA_FILE, com modelo YDD e YMT exigidos |
| Armas com metas reconhecidos | Registros WEAPONINFO_FILE_PATCH, WEAPON_METADATA_FILE e WEAPONCOMPONENTSINFO_FILE |
| Áudio | REL dat151/dat54 e wavepacks AWC com grupo identificado na estrutura original |

Cada recurso recebe `fxmanifest.lua`, identificação `-- Convertido com RPF Forge` e organização de arquivos. Conteúdos desconhecidos, XML inválido, conflitos de destino e coleções incompletas interrompem o pacote antes de gravar. Documentos e imagens auxiliares são informados como ignorados. A validação de gravação usa SHA-256.

Para veículos, o campo editável altera o spawn e as referências. Para outros conteúdos, altera somente o nome do recurso/pasta: coleções de roupas e nomes internos permanecem intactos. O app não executa scripts contidos nos pacotes.

## Um clique para YTYP

Em uma pasta com YDRs e sem RPF, o menu existente passa a mostrar **Gerar YTYP com RPForge**. Um clique abre o app, gera automaticamente e mostra o resultado. Selecionar essa pasta pelo app tem o mesmo efeito. Não há confirmação de prévia obrigatória nem novo atalho separado.

O gerador é implementado em JavaScript no próprio projeto. Lê RSC7 Legacy versão 165, caixa e esfera delimitadoras; usa hashes Jenkins dos nomes; associa YTD/YBN homônimos quando presentes. Cria YTYP **binário RSC7 versão 2**, não um XML com extensão trocada. O app não depende do GTAUtil, do cache enviado ou de bibliotecas CodeWalker em execução.

Os arquivos são `rpforge_props.ytyp`, com sufixo se o nome existir. A criação usa publicação sem sobrescrita. Mais de 256 modelos são divididos entre YTYPs; limite de 4096 modelos, 256 MiB por YDR e 1 GiB de leitura por operação. Todos os modelos são lidos antes de iniciar a gravação. Os originais permanecem intactos.

O template vazio de esquema é gerado com dados sintéticos pelo script de desenvolvimento `Create-YtypTemplate.ps1`; não contém modelos, cache ou conteúdo do GTA. Sua interpretação binária é verificada pelo leitor independente do CodeWalker em `Test-YtypInterop.ps1`, com 1, 2 e 256 arquétipos. Essas ferramentas opcionais de desenvolvimento não são redistribuídas nem necessárias para usar o gerador.

## Limites reais

O suporte continua sendo GTA V Legacy RPF7 OPEN/NONE. Não há descriptografia, suporte genérico a Enhanced, execução de scripts de mods single-player, tradução de qualquer meta desconhecido ou criação de YMTs ausentes. Pacotes mistos de veículos com outros tipos especiais podem exigir separação e são recusados quando o conversor de veículos não reconhece suas declarações.

YTYPs básicos não recriam salas, portais, entidades ou extensões de MLO. Esses dados precisam vir no YTYP original. Texturas compartilhadas sem YTD homônimo, dependências de outros recursos, coordenadas de mapas, direitos de streaming de roupas e integração com inventários/menus precisam ser conferidos no servidor. Gerar o recurso não substitui o teste no FiveM.

Registros seguem a [documentação de data files](https://docs.fivem.net/docs/game-references/data-files/) e o [manifest de recursos](https://docs.fivem.net/docs/scripting-reference/resource-manifest/). A estrutura binária foi verificada com o [leitor YtypFile do CodeWalker](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/FileTypes/YtypFile.cs).

## Organização local

O projeto fica em `D:\RedHorn\Desenvolvimento\RPForge`. Código em `src`, interface em `desktop`, documentação em `docs`, materiais de marca em `design\identidade` e artefatos de desenvolvimento em `.tools`. O material completo de identidade é mantido localmente, fora do versionamento. A instalação do Windows permanece em seu caminho registrado para preservar a integração existente.
