# RPF to FiveM

Converta addons de veículos GTA V em recursos FiveM pelo botão direito do Windows.
Código aberto, licença MIT. Independente do RedHorn Studio e do RedHorn Garage.

## Instalar no Windows pelo instalador

Abra `RPF-to-FiveM-Setup-0.1.1-x64.exe` e conclua a instalacao.
O pacote inclui o runtime e as dependencias; o usuario nao precisa instalar Node.js,
abrir terminal ou baixar outros programas. Nao requer administrador.
O menu do botao direito e a opcao de desinstalacao sao registrados automaticamente.

O instalador e gerado somente sob pedido e permanece local ate autorizacao de publicacao.

## Instalar a partir do codigo-fonte

Requer **Node.js 22 ou superior**, com `node` e `npm` no PATH.
Baixe o projeto para uma pasta permanente (ou clone com Git) e abra um terminal nela:

```powershell
npm ci
npm test
npm run menu:install
```

Não requer administrador. O menu é registrado somente para o usuário atual.
Mantenha a pasta do projeto no mesmo lugar; reinstale o menu se a mover.

## Usar

1. Clique com o botão direito na pasta que contém `dlc.rpf` ou outros `.rpf`, ou no espaço vazio dentro dela.
2. Selecione **Converter RPF para FiveM**. No Windows 11, pode estar em **Mostrar mais opções**.
3. Aguarde o resultado na janela de console; pressione Enter para fechar.

O menu aparece nas pastas em geral; a presença de RPF é verificada ao clicar.
Esta implementação não instala extensão COM para filtrar pastas dinamicamente.
Não pesquisa em subpastas do Windows, mas extrai RPFs aninhados dentro dos arquivos.

Para uma pasta `meu_carro` contendo `dlc.rpf`, a saída é:

```text
meu_carro/
  dlc.rpf                       # original preservado
  meu_carro_fivem/
    fxmanifest.lua
    conversion-report.json
    stream/
      carro.yft
      carro_hi.yft
      carro.ytd
    data/
      001/vehicles.meta
      002/handling.meta
```

Copie a pasta gerada para `resources` e adicione `ensure meu_carro_fivem` ao seu `server.cfg`.
A ferramenta não altera a base de testes, `server.cfg`, handling, liveries ou texturas.
Valide o veículo no FiveM antes de colocar em produção.

Também pode executar sem o menu:

```powershell
npm run convert -- "C:\Mods\Meu Carro"
```

Um addon é criado por RPF externo. Vários veículos no mesmo RPF permanecem no mesmo addon.
Metas são mantidos em subpastas numeradas para preservar múltiplas origens sem mesclar XMLs
ou perder configurações. Este conversor não aplica regras particulares de servidores.

## Compatibilidade e proteção dos arquivos

- GTA V **Legacy RPF7 OPEN/NONE**, sem necessidade de instalar GTA, OpenIV ou CodeWalker.
- RPFs internos, binários DEFLATE e resources RSC7, incluindo entradas maiores que 16 MiB.
- Stream de `.yft`, `.ytd`, `.ydr`, `.ydd`, `.ybn` e `.ycd`.
- Metas: vehicles, handling, carcols, carvariations, vehiclelayouts, dlctext e caraddoncontentunlocks.
- Validação de XML, presença dos YFTs declarados e conflitos de nomes.
- Originais preservados, saída preparada em pasta temporária e recusada se já existir.
- Falhas em um arquivo não impedem a análise dos demais RPFs da pasta.
- Sem upload de assets, telemetria, executáveis externos, chaves do GTA ou conteúdo do jogo no repositório.

Não aceita RPF criptografado, GTA V Enhanced, conversão de mapas, áudio customizado ou pacotes
sem `vehicles.meta`. Metas/tipos especiais não suportados geram erro para evitar saída incompleta.
Não executa scripts fornecidos pelo addon. Documentos e imagens não utilizados ficam listados no relatório.

Limites desta versão: RPF de até 512 MiB, entrada de até 256 MiB, 1 GiB acumulado de extração,
100 mil entradas e 16 níveis de RPF. O processamento usa memória; não é um extrator genérico de arquivos enormes.
Não corrige conflitos de modkits entre recursos, dependências externas ou erros originais do modelo.

## Remover o menu

```powershell
npm run menu:uninstall
```

Remove somente as entradas `RpfToFiveM` em `HKCU\Software\Classes\Directory\shell`
e `HKCU\Software\Classes\Directory\Background\shell`.

## Desenvolvimento

```powershell
npm ci
npm test
```

### Gerar e validar o instalador local

```powershell
npm run installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Test-Installer.ps1
```

O build roda os testes, prepara somente arquivos do programa, inclui Node.js x64 e sua
licenca, instala um compilador Inno Setup 6.7.3 no cache local do projeto apos verificar
o SHA-256 oficial e gera o instalador em `release`, junto com o hash. E possivel indicar
um compilador existente usando `-CompilerPath` no script de build.
Verifique os termos do compilador para a modalidade de distribuicao pretendida.

O teste de ciclo de vida instala silenciosamente em uma pasta temporaria, verifica
o menu, converte um RPF sintetico usando apenas o runtime incluido e desinstala.
Confirma que os arquivos do usuario permanecem e restaura o menu de desenvolvimento.
Nao ha upload ou criacao automatica de release no GitHub. O `.exe` ainda nao possui assinatura digital.

Os testes criam RPFs sintéticos; não dependem de assets proprietários.
A suíte cobre extração, RPF aninhado, cabeçalhos RSC7, arquivos inválidos, conflitos, XML,
preservação do original e recusa de sobrescrita. Não substitui validação dentro do jogo.

Referências técnicas: [manifest FiveM](https://docs.fivem.net/docs/scripting-reference/resource-manifest/),
[tipos de data_file](https://docs.fivem.net/docs/game-references/data-files/) e
[estrutura RPF7 documentada no CodeWalker](https://github.com/dexyfex/CodeWalker/blob/master/CodeWalker.Core/GameFiles/RpfFile.cs).
A biblioteca CodeWalker não é incorporada ou distribuída.

Dependência: `@xmldom/xmldom` (MIT), com sua licença mantida no pacote instalado.
A licença deste projeto não concede direitos sobre os mods convertidos.

Não afiliado à Rockstar Games ou Cfx.re.
