# Migração da instalação local para distribuição

Implementação preparada localmente em 1 de novembro de 2026. Não gera instalador,
não importa certificados e não altera uma instalação existente durante os testes.

## Regras do menu

- O script lê a identidade do manifesto dentro do pacote MSIX da própria instalação.
  Aceita somente `RedHorn.RPFForge.Local` e `RedHorn.RPFForge`.
- O registro novo deve terminar com estado `Ok` antes de remover a identidade local.
  Falha ou registro pendente preservam a identidade antiga.
- A propriedade é registrada por identidade, além da chave antiga de compatibilidade.
  Isso impede que a remoção de uma identidade apague a propriedade da outra.
- O menu de outra pasta de instalação é preservado. Ausência de propriedade durante
  a desinstalação também preserva o pacote, em vez de presumir que ele é desta cópia.
- A propriedade antiga é preservada para permitir nova tentativa se a remoção falhar.
- A migração pública exige que o RPForge esteja fechado; o script não encerra a janela.
- Nenhum RPF, recurso, projeto ou certificado confiável é removido pela migração.

## Verificação local

```powershell
./scripts/Test-MenuMigration.ps1
npm test
npm run desktop:build
npm run desktop:test
```

Os testes de migração usam callbacks simulados e pacotes ZIP sintéticos. Exercitam
sucesso, falha de registro, estado pendente, propriedade de outra cópia, falha ao
remover a identidade antiga e atualização local. Também verificam identidade do
pacote e proteção da propriedade na desinstalação. Não chamam Add-AppxPackage,
Remove-AppxPackage ou alterações do registro do Windows.

Os testes de conversão incluem cancelamento com saída existente, falha de gravação,
dados temporários corrompidos, restauração após falha de publicação da pasta e lote
com RPF inválido seguido de RPF válido. Todos usam arquivos sintéticos em pastas
temporárias. O teste da interface confirma o cancelamento sem backup desnecessário,
sem perda da saída anterior e sem mostrar uma conversão antiga como sucesso atual.

“Cancelar” aqui é a escolha para uma saída existente e o cancelamento do seletor
de pasta. O aplicativo continua bloqueando o fechamento durante a gravação; não
foi acrescentado um botão de interrupção no meio da conversão.

## Ainda necessário

Testar o registro, atualização e desinstalação reais em um Windows de teste quando
o pacote público assinado estiver disponível. Os testes simulados não comprovam
a aceitação de uma identidade ou certificado pela instalação Appx do Windows.
