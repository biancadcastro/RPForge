# Preparação dos binários assinados

Este caminho não compila, assina, instala ou publica o aplicativo. Ele valida os
artefatos recebidos da assinatura e prepara uma pasta nova em `.tools`.

Depois da aprovação da Foundation e da configuração real de `signpath/project.json`:

```powershell
./scripts/Build-Installer.ps1 `
  -SignedBinaryDirectory .tools/signpath/signed `
  -UnsignedBinaryDirectory .tools/signpath/unsigned `
  -ValidateSignedInputsOnly
```

O diretório original deve ser o artefato preservado da execução de Actions que
originou a assinatura. O diretório assinado deve conter `RPFForge.exe` e
`ForgeShell.dll`. Não substituir o original pela cópia assinada: os hashes são
distintos e têm funções diferentes na validação.

Verificações antes da cópia:

- Aprovação habilitada e Publisher real configurado, sem identidade local de teste.
- Checkout limpo, mesma revisão, versão, toolchain e inventário completo de fontes.
- Origem declarada como build de Actions, com identificador de execução.
- Hashes dos binários originais correspondentes ao manifesto preservado.
- Authenticode válido, Publisher esperado e presença de assinatura de tempo.
- Conteúdo PE correspondente ao original: apenas checksum, entrada da tabela de
  certificados, alinhamento final e certificado anexado podem mudar.
- Metadados de produto, versão, arquitetura e nomes originais corretos.
- Hashes das cópias conferidos; manifesto separado registra os hashes assinados.

O manifesto local não substitui a verificação da origem na SignPath e no GitHub.
Os artefatos devem ser obtidos da execução confiável, não de uploads de terceiros.
A validação depende da confiança de certificados e das verificações de revogação
disponíveis no Windows que executa o processo.

## Limites atuais

Sem `-ValidateSignedInputsOnly`, os parâmetros de artefatos assinados interrompem
o script antes de qualquer ferramenta de compilação ou empacotamento. Isso evita
cair silenciosamente no fluxo que gera a identidade local.

A chamada sem esses parâmetros continua sendo o **fluxo local de desenvolvimento**.
Ela não se torna um instalador público por ter um nome de versão.

A montagem pública ainda precisa de uma identidade MSIX aprovada, seu registro e
desinstalação, assinatura do pacote MSIX e do instalador, e testes em Windows limpo.
O Node.js de terceiros deve conservar a assinatura upstream. Não foi gerado um
instalador para validar esta implementação.
