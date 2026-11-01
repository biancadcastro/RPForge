# RPForge

Converta addons de veículos GTA V em recursos FiveM pelo botão direito do Windows.
Ferramenta independente do RedHorn Studio e do RedHorn Garage. Licença MIT.
O desenvolvimento atual permanece local, sem autorização para publicação.

**Code signing policy:** [politica e status da preparacao para SignPath](docs/CODE_SIGNING_POLICY.md).
Ainda nao ha aprovacao ou assinatura de distribuicao pela SignPath Foundation.
Veja tambem [privacidade](docs/PRIVACY.md) e [roteiro da candidatura](docs/SIGNPATH_PREPARATION.md).
O [build de preparacao SignPath](docs/SIGNPATH_BUILD.md) usa ferramentas fixadas,
metadados verificados, SBOM e proveniencia. Produz somente binarios proprios sem assinatura;
nao gera instalador, nao altera certificados e nao publica. O workflow permanece manual
e a assinatura esta desativada ate a aprovacao/configuracao explicita.
Avisos de componentes externos: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Resumo do produto e dos recursos: [docs/RESUMO.md](docs/RESUMO.md).
Interface atual: [guia de uso](docs/INTERFACE.md), [identidade visual](docs/IDENTIDADE.md) e [desenvolvimento/testes](docs/DESENVOLVIMENTO_INTERFACE.md).
As melhorias recentes estao na versao de desenvolvimento; o instalador antigo 0.2.0
nao as contem. Nao gerar outro instalador sem pedido explicito.

## Instalar no Windows pelo instalador

Abra `RPF-Forge-Setup-0.2.0-x64.exe` e conclua a instalacao.
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
2. Selecione **Converter RPF para FiveM**, fornecido pela extensão nativa do RPF Forge para o menu moderno do Windows 11.
3. A janela do RPF Forge analisa o pacote e mostra os veiculos. Preencha **Novo spawn** se quiser renomear; vazio mantem o atual.
4. Na aba **Destinos**, selecione os RPFs e escolha outro nome, backup/substituicao ou cancelamento para pastas existentes.
5. Clique em **Analisar / atualizar previa** depois de editar e revise **Previa e validacao** e **Arquivos por peso**.
6. Clique em **Converter selecionados**. O botao **Abrir resultado** fica disponivel ao concluir.

A extensão moderna implementa `IExplorerCommand` em C++ e registra os contextos de pasta
e fundo de pasta com um pacote de identidade. Oculta a ação em pastas sem RPF.
As entradas tradicionais permanecem para compatibilidade.
Não pesquisa em subpastas do Windows, mas extrai RPFs aninhados dentro dos arquivos.

Para um carro com spawn `carro`, mantendo o nome atual, a saída é:

```text
meu_carro/
  dlc.rpf                       # original preservado
  carro/
    fxmanifest.lua
    stream/
      carro.yft
      carro_hi.yft
      carro.ytd
      mods/
        carro_bumper.yft
    data/
      vehicles.meta
      handling.meta
```

Copie a pasta gerada para `resources` e adicione `ensure carro` ao seu `server.cfg`.
Não é gerado relatório JSON. Arquivos auxiliares ignorados e correcoes aparecem na previa e no resultado.
Ao escolher um novo spawn, a pasta recebe esse nome e os YFTs, YTDs e referências
correspondentes nos metas são atualizados. Dicionários e handling compartilhados são
preservados quando necessários a outro veículo. Valores de física, áudio, texturas
internas e liveries permanecem intactos. Nomes novos aceitam letras maiúsculas e minúsculas, números e `_`,
começam com letra e têm até 63 caracteres; nomes reservados do Windows são recusados.
A capitalização digitada é preservada na pasta, arquivos e referências. Conflitos são
verificados sem distinguir maiúsculas de minúsculas (`Carro` e `CARRO` conflitam).
A ferramenta não altera a base de testes ou `server.cfg`.
Valide o veículo no FiveM antes de colocar em produção.

Também pode executar sem o menu:

```powershell
npm run convert -- "C:\Mods\Meu Carro"
```

Um addon é criado por RPF externo. Vários veículos no mesmo RPF permanecem no mesmo addon.
Nesse caso, os spawns podem ser editados individualmente e a pasta usa `<primeiro_spawn>_pack`,
considerando a ordem alfabética dos spawns finais. A execução sem `--interactive`
mantém os spawns atuais. O menu do Explorer abre a janela quando ela esta instalada;
`RPF_FORGE_CONSOLE=1` preserva o modo de perguntas no terminal para diagnostico.
Metas ficam diretamente em `data`, sem subpastas numeradas. Definicoes compativeis de
metas do mesmo nome sao unificadas por identidade (modelo, handling, kit etc.).
Definicoes contraditorias sao recusadas e conflitos de IDs de modkit sao detectados.
O manifest inclui o comentario `-- Convertido com RPF Forge`.
Pecas de tuning e seus arquivos associados ficam em `stream/mods`.
Modelos principais, seus `_hi` e dicionarios compartilhados permanecem em `stream`.
Opcoes visuais e referencias vinculadas em `carcols.meta` cujo modelo nao veio no RPF
sao removidas automaticamente. A verificacao considera arquivos YFT/YDR, incluindo
subpastas, sem distinguir maiusculas. Melhorias de desempenho (`statMods`), liveries,
IDs de modkit e configuracoes de sirene permanecem preservados. A lista do que foi
removido aparece na previa e no resultado, sem criar relatorio no addon.

## Compatibilidade e proteção dos arquivos

- GTA V **Legacy RPF7 OPEN/NONE**, sem necessidade de instalar GTA, OpenIV ou CodeWalker.
- RPFs internos, binários DEFLATE e resources RSC7, incluindo entradas maiores que 16 MiB.
- Stream de `.yft`, `.ytd`, `.ydr`, `.ydd`, `.ybn` e `.ycd`.
- Metas: vehicles, handling, carcols, carvariations, vehiclelayouts e caraddoncontentunlocks.
- `dlctext.meta`, `shopdata.meta` e `shop_vehicle.meta` sao ignorados: nao entram em `data` nem no manifest.
- Validação de XML, presença dos YFTs declarados e conflitos de nomes.
- Originais preservados, previa sem gravacao, saida preparada em pasta temporaria e verificada por hash antes da entrega.
- Pastas existentes: cancelamento, outro nome ou backup e substituicao. O backup permanece ao lado do addon; arquivos em uso nao sao forcados a fechar.
- Validacao de modelos, variacoes, handling, dicionarios, tuning, modkits e manifest. Dependencias externas/embutidas sao avisos quando nao podem ser confirmadas.
- Diagnostico de peso dos arquivos, ordenado do maior para o menor. E tamanho em disco, sem estimativa de memoria de video ou FPS.
- Falhas em um arquivo não impedem a análise dos demais RPFs da pasta.
- Sem upload de assets, telemetria, executáveis externos, chaves do GTA ou conteúdo do jogo no repositório.

Não aceita RPF criptografado, GTA V Enhanced, conversão de mapas, áudio customizado ou pacotes
sem `vehicles.meta`. Metas/tipos especiais não suportados geram erro para evitar saída incompleta.
Não executa scripts fornecidos pelo addon. Documentos e imagens não utilizados são informados no console.

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
npm run desktop:build
npm run desktop:test
```

Para atualizar somente o codigo e a janela da instalacao local existente, use
`npm run update:local`. Esse comando guarda backup e nao gera Setup nem publica.
O fluxo da janela usa pedidos locais temporarios, nao abre servidor HTTP e nao envia arquivos pela rede.
O teste desktop exercita a interface e seu processo de conversao com um RPF sintetico,
incluindo previa, edicao de spawn, backup/substituicao, resultado e pasta vazia.

### Gerar e validar o instalador local

Desde a versao 0.2.0, o instalador inclui uma DLL C++ e um pacote de identidade assinado
com certificado **RPF Forge Local Test**. Esta assinatura e apenas para testes locais.
Antes da instalacao, a confianca no certificado publico precisa de autorizacao explicita
do usuario. A ferramenta nao importa certificados automaticamente nem ativa modo de
desenvolvedor. Uma assinatura de distribuicao sera necessaria para uma futura publicacao.
A implantacao MSIX nesta maquina exige confianca em `LocalMachine\TrustedPeople`,
com autorizacao explicita e UAC. `CurrentUser\TrustedPeople` nao foi suficiente.
O script `Trust-LocalTestCertificate.ps1` executa somente esse passo autorizado;
nao e chamado automaticamente pelo instalador e nao altera o repositorio Root.

O compilador nativo usado nesta maquina e LLVM-MinGW 20261020 UCRT x64 (release oficial
`mstorsjo/llvm-mingw`, SHA-256 do ZIP: `fd5462b7f5d93b2ff981fcd3f9c7e427e47f3203c64ea91c27bcc444eebd74cd`).
O empacotamento usa Microsoft.Windows.SDK.BuildTools 10.0.28000.2957 do NuGet oficial.
Ambos ficam em `.tools`, fora do Git e do instalador. A chave de assinatura permanece
no repositorio pessoal de certificados do Windows, nunca no codigo ou instalador.

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
