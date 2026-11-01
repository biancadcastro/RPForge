# RPF Forge — resumo do aplicativo

O RPF Forge transforma pacotes de veiculos GTA V Legacy em addons FiveM organizados.
E um produto independente do RedHorn Studio e do RedHorn Garage, com processamento local.

## Acesso e fluxo

- Comando **Converter RPF para FiveM** no menu principal do Windows 11.
- Funciona sobre a pasta e no espaco vazio dentro dela; a extensao detecta a presenca de RPF.
- Janela com abas **Veiculos**, **Destinos**, **Previa e validacao** e **Arquivos por peso**.
- Analise antes de converter; nenhuma extracao e gravada durante a previa.
- Edicao de spawns por carro, com maiusculas e minusculas preservadas. Campo vazio mantem o nome atual.
- Alterar nomes ou destinos exige atualizar a previa. O RPF tambem e conferido para detectar mudancas desde a analise.
- Progresso por etapa, bloqueio de operacoes duplicadas e resultado com acesso a pasta criada.

## Conversao e organizacao

- Extracao de RPF7 OPEN/NONE, inclusive arquivos RPF internos.
- Um addon por RPF externo; pacotes com varios carros permanecem juntos.
- Pasta com o spawn escolhido ou atual; pacotes usam o primeiro spawn seguido de `_pack`.
- Modelos e dicionarios principais em `stream`; tuning e arquivos associados em `stream/mods`.
- Metas diretamente em `data`, sem subpastas numeradas.
- Metas de mesmo nome de RPFs internos sao unificados quando suas definicoes sao compativeis.
- Definicoes contraditorias, nomes duplicados e conflitos de modkits sao apontados.
- `fxmanifest.lua` gerado com os registros necessarios e `-- Convertido com RPF Forge`.
- Sem `conversion-report.json` no addon.

## Spawns e tuning

- Renomeia arquivos correspondentes e suas referencias nos metas, incluindo texturas dedicadas, handling proprio e tuning.
- Mantem dependencias compartilhadas quando outro carro ainda precisa delas.
- Preserva conteudo binario das texturas, nomes internos das liveries, audio e valores de fisica.
- Remove opcoes visuais e referencias de tuning cujo modelo nao veio no RPF.
- Preserva pecas disponiveis, melhorias de desempenho, liveries, sirenes e IDs dos modkits.
- Ignora `dlctext.meta`, `shopdata.meta` e `shop_vehicle.meta`.

## Validacao e seguranca dos arquivos

- Valida XML, modelos declarados, variacoes, referencias de tuning e vinculos de modkit.
- Confere manifest, lista de arquivos e tipos `data_file`.
- Diferencia erros comprovados de dependencias externas ou texturas embutidas que exigem verificacao no jogo.
- Bloqueia a conversao se a validacao encontrar erros estruturais.
- Grava primeiro em uma pasta temporaria e confere os bytes por SHA-256 antes de entregar o addon.
- Se o destino existir, permite cancelar, usar outro nome ou criar backup e substituir.
- Preserva o RPF original e os backups. Nao fecha aplicativos para forcar alteracoes.

## Diagnostico de peso

- Lista modelos, texturas e outros arquivos de streaming em ordem de tamanho.
- Mostra tamanho total e individual em disco, em MiB.
- A janela mostra ate 200 arquivos por peso para manter a navegacao leve.
- Nao estima VRAM/FPS nem reduz texturas ou geometria automaticamente.

## Limites e desenvolvimento

- Suporte atual: veiculos GTA V Legacy em RPFs abertos, ate 512 MiB por arquivo externo.
- Sem suporte a RPF criptografado, GTA V Enhanced, mapas ou audio customizado.
- A validacao estrutural nao substitui o teste no FiveM nem confirma dependencias de outros recursos.
- Interface de desenvolvimento para Windows, usando o runtime ja incluido na instalacao local.
- Nada e publicado automaticamente. Instaladores novos somente sob pedido explicito.
- A assinatura da integracao moderna e de teste local; uma distribuicao futura exige revisao de assinatura.
