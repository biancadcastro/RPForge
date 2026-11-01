# Interface RPForge

A janela desktop usa a identidade de bigorna e faísca, grafite e laranja, com a mesma **Pixelify Sans** do portfólio da Bianca. Caminhos, spawns e diagnóstico usam Consolas para diferenciar caracteres técnicos.

## Fluxo

1. **Pasta de origem:** selecione a pasta que contém os RPFs externos. O menu do Explorer pode fornecê-la automaticamente.
   O seletor moderno do Windows permite digitar um caminho na barra de endereço, pesquisar e navegar pelo Explorer. **Usar esta pasta** confirma e inicia a análise automaticamente; cancelar mantém a origem e a prévia atuais. Confirmar a mesma pasta analisa novamente, preservando as configurações de spawn e destino.
2. **Veículos:** confira o spawn original. O campo vazio mantém o nome; `manter original` é apenas uma indicação visual, não um valor enviado ao conversor.
3. **Destinos:** marque os RPFs a converter, edite o nome da pasta e escolha o tratamento de conflitos.
4. **Analisar arquivos:** atualize a prévia depois de editar spawns/destinos ou digitar uma origem manualmente. Ao escolher a pasta pelo seletor, a análise é automática. A conversão permanece bloqueada até uma prévia válida.
5. **Prévia e resultado:** confira os spawns finais, renomeações, metas, remoções previstas e diagnóstico.
6. **Converter selecionados:** acompanhe o progresso. O resultado informa quais addons foram concluídos, cancelados ou falharam.
7. **Abrir resultado:** abre o último addon concluído nessa operação. O botão é desabilitado durante operações e não conserva um resultado de outra pasta.

## Conflitos de pasta

| Escolha | Comportamento |
| --- | --- |
| Cancelar | Não substitui a pasta existente; esse RPF não é convertido. |
| Usar outro nome | Digite uma pasta de saída diferente e analise novamente. |
| Backup e substituir | Preserva a pasta anterior em backup antes de entregar o addon. |

As escolhas ficam na tabela de destinos, visíveis antes da conversão. Não há sobrescrita automática nem necessidade de confirmar novamente uma escolha já feita na prévia.

## Estados e proteção

- Origem alterada: limpa contadores, linhas, prévia e resultado anteriores.
- Spawn, seleção ou destino editado: invalida a prévia e bloqueia Converter.
- Operação em andamento: bloqueia alterações na origem e ações duplicadas; não permite fechar a janela antes de terminar.
- Progresso com total conhecido: mostra a fração real informada pelo backend. Sem total: indicador indeterminado.
- Falha: mostra diagnóstico e não mantém um botão apontando para uma saída antiga.
- Conclusão parcial: distingue falhas e cancelamentos de addons concluídos. O jogo ainda precisa ser testado no FiveM.

## Teclado

- `Alt+P`: escolher pasta.
- `Alt+A`: analisar arquivos.
- `Alt+C`: converter selecionados, quando permitido.
- `Alt+R`: abrir resultado, quando disponível.
- `Tab` / `Shift+Tab`: navegar pelos controles.
- As tabelas mantêm edição e seleção nativas por teclado. Os desenhos customizados não substituem seus valores nem sua semântica.

## Espaço em disco e ajuda

**Espaço em disco** mostra até 200 arquivos de streaming, do maior para o menor. Não estima VRAM/FPS, não exclui arquivos e não otimiza texturas automaticamente.

**Ajuda** contém instruções de uso, limites, tratamento de conflitos, atalhos e a licença da fonte. Não depende de navegador nem conexão.

## Prévia de desenvolvimento

A janela aberta de desenvolvimento executa o conversor real. Analisar é uma operação de leitura; Converter grava addons de acordo com a prévia. Ela não tem atualização automática: mudanças no código requerem outra instância compilada. Uma instância já aberta não é fechada automaticamente.

Nenhum instalador foi gerado por esta alteração.
