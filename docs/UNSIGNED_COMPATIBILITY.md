# Verificação da operação sem certificado

Verificação local em 2026-11-01. Nenhum instalador gerado, nenhuma publicação,
nenhuma alteração na instalação ou nos certificados do Windows.

## Resultados

- Executável de desenvolvimento e executável instalado: Authenticode `NotSigned`.
- Sessão dos testes sem elevação de administrador.
- 53 testes Node aprovados: extração, conversão de veículos e outros conteúdos,
  spawn com maiúsculas, metadados, tuning ausente, organização de arquivos,
  auditoria, YTYP, falhas de escrita, restauração de saída e cancelamento.
- Compilação de desenvolvimento e autoteste dos estados da interface aprovados.
- Fluxo GUI → bridge aprovado com fixtures sintéticas: veículos, roupas, mapas,
  backup e geração automática de YTYP sem sobrescrever arquivos existentes.
- Seis cenários simulados de migração do menu aprovados; não registram pacotes
  nem alteram o registro real do Windows.

Esses resultados não substituem validação no FiveM nem testes numa instalação
limpa sem o certificado local anteriormente autorizado neste computador.

## Limite do empacotamento atual

O instalador atual usa `PrivilegesRequired=lowest`, registra comandos clássicos
em HKCU e exige sucesso de `Register-ModernMenu.ps1` no pós-instalação.
`Build-Shell.ps1` gera a identidade MSIX assinada com o certificado local de teste.
Esse fluxo não é um instalador público independente de certificado: uma máquina
limpa não confia automaticamente no certificado local. Elevar o EXE não muda isso.

O menu clássico é uma alternativa sem identidade MSIX assinada, acessível em
“Mostrar mais opções” no Windows 11. Antes de distribuir nessa modalidade,
é necessário separar o empacotamento clássico do registro obrigatório do menu
moderno e validar instalação, atualização e remoção em ambiente limpo.

O Windows 11 também oferece MSIX unsigned com identidade específica e
`Add-AppxPackage -AllowUnsigned`, destinado pela Microsoft a testes, não à
distribuição ampla. Não foi aplicado nem testado neste trabalho.

Não alterar todos os processos para `requireAdministrator`: conversão e YTYP
funcionaram sem elevação em pastas graváveis. Elevar apenas operações que
realmente precisem modificar locais protegidos. SmartScreen, Smart App Control,
políticas empresariais e reconhecimento do publicador continuam independentes
da solicitação de administrador.

Referência: https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package
