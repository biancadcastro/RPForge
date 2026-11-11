# RPForge — resumo do aplicativo

O RPForge transforma RPFs de conteúdos GTA V Legacy em recursos FiveM organizados, gera YTYPs de YDRs em um clique e, no plano Pro, trabalha roupas YDD (OBJ, Neon e separação de pele).
E um produto independente do RedHorn Studio e do RedHorn Garage, com processamento local. Versao atual: 1.0.1.

## Ferramentas

| Ferramenta | Acesso |
| --- | --- |
| Converter RPFs | Free, sem conta |
| Gerar YTYP | Free, sem conta |
| Roupas para OBJ | Pro: entrar na conta e licenca `clothing.obj` |
| Roupas para Neon | Pro: entrar na conta e licenca `clothing.neon` |
| Separar pele | Pro: entrar na conta e licenca `clothing.skin` |

O Pro e concedido manualmente no servidor; nao ha preco, checkout ou pagamento no app. Detalhes em SUBSCRIPTIONS.md e CLOTHING_*.md.

## Acesso e fluxo

- Interface Electron + Next.js (`desktop-web/`), incluida no instalador atual (1.0.1). A janela WinForms em `desktop/` permanece apenas como fallback legado.
- Comandos **Converter RPFs com RPForge** e **Gerar YTYP com RPForge** no menu do Windows 11 e no menu classico; os comandos de roupas (**Roupas para OBJ com RPForge**, **Roupas para Neon com RPForge**, **Separar pele com RPForge**) aparecem sobre YDDs e pastas quando ha licenca Pro valida.
- Funciona sobre a pasta e no espaco vazio dentro dela; a extensao detecta a presenca de RPF.
- Fluxo guiado **Configurar → Revisar → Resultado**, com **Ajuda** como página auxiliar; acoes rapidas abrem uma janela compacta.
- Identidade do site rpforge.dev, embutida para uso offline: Atkinson Hyperlegible no texto e nos controles, Pixelify Sans só em títulos grandes e no logo. Slogan: "Você cria. O RPForge organiza."
- Analise antes de converter; nenhuma extracao e gravada durante a previa.
- Edicao de spawns por carro, com maiusculas e minusculas preservadas. Campo vazio mantem o nome atual.
- Alterar nomes ou destinos é validado automaticamente ao avançar para Revisar. O RPF tambem e conferido para detectar mudancas desde a analise.
- Progresso por etapa, bloqueio de operacoes duplicadas e resultado com acesso a pasta criada.

## Conversao e organizacao

- Extracao de RPF7 OPEN/NONE, inclusive arquivos RPF internos.
- Um recurso por RPF externo; pacotes com varios carros permanecem juntos.
- Pasta com o spawn escolhido ou atual; pacotes usam o primeiro spawn seguido de `_pack`.
- Modelos e dicionarios principais em `stream`; tuning e arquivos associados em `stream/mods`.
- Metas diretamente em `data`, sem subpastas numeradas.
- Metas de mesmo nome de RPFs internos sao unificados quando suas definicoes sao compativeis.
- Definicoes contraditorias, nomes duplicados e conflitos de modkits sao apontados.
- `fxmanifest.lua` gerado com os registros necessarios e `-- Convertido com RPForge`.
- Sem `conversion-report.json` no recurso.

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
- Grava primeiro em uma pasta temporaria e confere os bytes por SHA-256 antes de entregar o recurso.
- Se o destino existir, permite cancelar, usar outro nome ou criar backup e substituir.
- Preserva o RPF original e os backups. Nao fecha aplicativos para forcar alteracoes.

## Diagnostico de peso

- Lista modelos, texturas e outros arquivos de streaming em ordem de tamanho.
- Mostra tamanho total e individual em disco, em MiB.
- A janela mostra ate 200 arquivos por peso para manter a navegacao leve.
- Nao estima VRAM/FPS nem reduz texturas ou geometria automaticamente.

## Limites e desenvolvimento

- Suporte atual: veículos, roupas, mapas/interiores, props, animações, texturas, peds, armas e formatos de áudio reconhecidos em RPFs abertos, até 768 MiB por arquivo externo.
- Sem suporte a RPF criptografado, GTA V Enhanced ou metas não reconhecidos. Consulte CONTEUDOS_E_YTYP.md para a matriz de suporte e limites.
- A validacao estrutural nao substitui o teste no FiveM nem confirma dependencias de outros recursos.
- Interface para Windows, com runtime Electron incluido no instalador; nao exige Node.js separado.
- Sem atualizacao automatica: novas versoes sao instaladas manualmente pelo instalador.
- Nada e publicado automaticamente. Instaladores novos somente sob pedido explicito.
- A assinatura da integracao moderna e de teste local; uma distribuicao futura exige revisao de assinatura.
