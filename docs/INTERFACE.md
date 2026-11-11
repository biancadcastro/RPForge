# Interface RPForge

O fluxo principal tem três etapas. Escolher a pasta inicia a análise automaticamente.

## 1. Configurar

- Escolha a pasta de origem pelo seletor moderno do Windows; a análise começa ao confirmar. Cancelar mantém a configuração atual.
- Nomes dos veículos e pastas de saída ficam juntos na mesma tela.
- Clique no nome para editar o **Nome no jogo (spawn)** de veículos ou o nome do recurso dos demais conteúdos. O nome original já vem preenchido.
- Marque os RPFs a converter. Em pacotes com vários veículos, cada spawn pode ser editado.
- Se a pasta já existir, escolha explicitamente **Cancelar**, **Usar outro nome** ou **Backup e substituir**. O app não escolhe uma ação por você.
- Clique em **Revisar conversão**. As edições são validadas automaticamente; não há um passo separado de reanálise.

Em janelas menores, a configuração tem rolagem vertical para manter campos e linhas legíveis.

## 2. Revisar

Confira nomes finais, pastas, avisos, metas unificados e tuning que será removido. **Voltar** retorna à configuração. **Converter agora** só é habilitado após uma prévia válida e revisada. A etapa de revisão não grava o recurso.

Se um spawn for inválido, o app mantém os campos preenchidos e bloqueia a conversão. Volte, corrija o campo e avance novamente.

## 3. Resultado

Após a gravação e validação final, o app informa recursos concluídos, cancelados e falhas. **Abrir resultado** abre o último recurso concluído nessa operação. **Nova conversão** reinicia o fluxo e permite escolher outra pasta.

A etapa Resultado não pode ser aberta antes de existir uma operação concluída ou com falha. Não se confunde com a prévia.

## Conflitos

| Escolha | Comportamento |
| --- | --- |
| Cancelar | Não substitui a pasta existente; esse RPF não é convertido. |
| Usar outro nome | Edite o nome da pasta de saída para um nome livre. |
| Backup e substituir | Preserva a pasta anterior em backup antes de entregar o novo recurso. |

## Ações auxiliares

**Ajuda** contém instruções e limites; a licença da fonte abre em uma janela separada. Essa página não é uma etapa obrigatória da conversão.

## Teclado e estados

- Alt+P: escolher pasta. Alt+A: continuar no fluxo. Alt+C: converter na etapa Revisar. Alt+R: abrir resultado.
- Tab/Shift+Tab navega pelos controles; as tabelas mantêm edição e seleção nativas.
- Mudar a origem limpa a prévia e o resultado anteriores.
- Editar um campo invalida a prévia; a validação acontece automaticamente ao avançar.
- Durante operações, a origem e as ações duplicadas ficam bloqueadas.
- Progresso só mostra porcentagem quando há um total real; caso contrário, é indeterminado.
- O RPF original permanece intacto e a validação estrutural não substitui testes no FiveM.

## Desenvolvimento

A prévia executa o conversor real: revisar é leitura; Converter grava recursos. Mudanças no código requerem uma nova instância. Janelas anteriores não são fechadas automaticamente. Nenhum instalador é gerado durante o desenvolvimento.

A configuração mostra o nome original e o nome no jogo. As decisões de destino aparecem somente quando existe conflito. Revisão e resultado usam cartões com detalhes técnicos recolhidos. Ajuda e licenças são separadas; documentos têm rolagem escura e as ações de conflito usam menu estilizado.

Pastas com YDRs e sem RPF iniciam a geração de YTYP automaticamente, em um clique, e mostram o resultado. Consulte [conteúdos e YTYP](CONTEUDOS_E_YTYP.md).
