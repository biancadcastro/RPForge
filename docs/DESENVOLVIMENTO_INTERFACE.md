# Desenvolvimento e validação da interface

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `desktop/RPFForge.cs` | Entrada, integração com o processo Node, prévia, pedidos, resultado e testes de estado. |
| `desktop/ForgeFlow.cs` | Etapas Configurar/Revisar/Resultado, ações contextuais e exigência de revisão antes de converter. |
| `desktop/ForgeTheme.cs` | Tokens, composição da janela, navegação, estado vazio e ajuda. |
| `desktop/ForgeControls.cs` | Moldura dos campos e pintura das células editáveis/checkboxes/seletores. |
| `desktop/ForgeFonts.cs` | Pixelify Sans embutida, registrada somente no processo. |
| `desktop/BrandAssets.cs` | Logo, símbolo e ícone embutidos; sem dependência de caminhos externos. |
| `desktop/ForgeVisualChecks.cs` | Cenários sintéticos para renderização de todas as telas. |

A aplicação mantém Windows Forms/.NET Framework e o contrato JSON do bridge Node. Não há servidor HTTP, navegador embutido ou dependência nova no runtime do conversor.

## Compilar e testar localmente

```powershell
npm test
npm run desktop:build
npm run desktop:test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-DesktopVisual.ps1
```

O build local gera apenas `.tools/desktop/RPFForge.exe`; não instala, não assina, não registra menus e não cria instalador. O compilador recebe todos os `.cs` de `desktop`, incluindo assets e fonte embutidos. O pipeline de assinatura existente também deve continuar compilando esse conjunto completo.

`--self-test` verifica bloqueios de edição, prévia vazia e inválida, navegação, carregamento da fonte, limpeza de saída anterior e layout compacto das ações. `--workflow-test` usa um RPF sintético para verificar análise, renomeação, conversão, backup e pasta vazia.

`--render-suite <pasta>` cria nove imagens com dados sintéticos: início, veículos, destinos, prévia, espaço em disco, janela compacta, ajuda, erro e resultado. As imagens ficam em `.tools`, fora do versionamento. Não são capturas de acervo pessoal nem evidência de um teste em jogo.

## Contratos de estado

- `busy` controla ações e alterações durante leitura/gravação.
- `previewValid` e `reviewed` só permitem Converter depois de uma análise válida e da etapa Revisar.
- `hasResults` libera a etapa Resultado somente após a operação.
- Conflitos de destino sem escolha explícita impedem avançar.
- Erros de validação preservam os campos editáveis para correção.
- `rendering` evita invalidar a prévia durante o preenchimento programático das tabelas.
- `boundFolder` impede reutilizar pedidos de outra origem.
- `expectedSource` vincula a conversão ao hash do RPF analisado.
- `lastOutput` é limpo ao trocar origem, reanalisar e iniciar outra conversão; resultados com falha não abrem uma pasta antiga.
- As mensagens de progresso tardias são ignoradas depois de encerrar a operação.

Os controles pintados continuam usando Button, TextBox e DataGridView nativos. Não simular o sucesso com alterações visuais; o resultado sempre vem do backend.

## Limitações da validação

Os testes exercitam o fluxo real com arquivos sintéticos e verificam renderização em 1280×860 e 1024×700 de área cliente. Não certificam suporte a leitores de tela, todos os percentuais de escala DPI, temas de alto contraste ou carregamento de veículos no FiveM. Esses cenários exigem validação adicional no ambiente de uso.

O título e os seletores de pasta permanecem integrados ao Windows; o indicador da barra de título pode variar com a versão e tema do sistema.
