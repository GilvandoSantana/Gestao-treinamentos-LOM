// CloudFilterHost — programa auxiliar em C# chamado pelo programa Electron
// principal, porque a API de "unidade de sincronização" do Windows
// (Windows.Storage.Provider) só existe em C++/C#, não em JavaScript.
//
// ATENÇÃO: este código NÃO foi compilado nem testado ainda — o ambiente
// onde foi escrito não tem acesso ao Windows nem ao NuGet pra validar.
// A primeira vez que ele roda de verdade é na máquina de quem for testar.
//
// ETAPA 1 (este arquivo): só registrar/desregistrar uma pasta como
// "unidade de sincronização" com nome e ícone próprios — sem ainda criar
// arquivo placeholder nenhum (isso é a próxima etapa, só depois de
// confirmar que esta parte funciona).
//
// Uso:
//   CloudFilterHost.exe check
//   CloudFilterHost.exe register <caminho-da-pasta> <nome-de-exibicao>
//   CloudFilterHost.exe unregister <caminho-da-pasta>

using Windows.Storage;
using Windows.Storage.Provider;

if (args.Length == 0)
{
    Console.WriteLine("Uso: CloudFilterHost.exe <check|register|unregister> [argumentos]");
    return 1;
}

string command = args[0].ToLowerInvariant();

try
{
    switch (command)
    {
        case "check":
        {
            bool supported = StorageProviderSyncRootManager.IsSupported();
            Console.WriteLine(supported ? "OK: suportado" : "ERRO: este Windows não suporta unidade de sincronização");
            return supported ? 0 : 1;
        }

        case "register":
        {
            if (args.Length < 3)
            {
                Console.WriteLine("Uso: CloudFilterHost.exe register <caminho-da-pasta> <nome-de-exibicao>");
                return 1;
            }
            string folderPath = args[1];
            string displayName = args[2];

            if (!Directory.Exists(folderPath))
            {
                Console.WriteLine($"ERRO: a pasta não existe: {folderPath}");
                return 1;
            }

            if (!StorageProviderSyncRootManager.IsSupported())
            {
                Console.WriteLine("ERRO: este Windows não suporta unidade de sincronização.");
                return 1;
            }

            var storageFolder = await StorageFolder.GetFolderFromPathAsync(folderPath);

            var info = new StorageProviderSyncRootInfo
            {
                // Identificador fixo — se mudar entre uma execução e outra,
                // o Windows entende que é uma unidade DIFERENTE.
                Id = "SupportMining.GestaoNuvem!ContaPadrao",
                Path = storageFolder,
                DisplayNameResource = displayName,
                // Ícone padrão do Windows por enquanto (uma nuvem genérica) —
                // trocar pelo ícone próprio do programa é um ajuste fino de
                // uma etapa posterior, depois que o básico estiver
                // confirmado funcionando.
                IconResource = "%SystemRoot%\\System32\\imageres.dll,-1043",
                Version = "1.0.0",
                // Por enquanto, sem placeholder — baixa tudo de verdade,
                // igual o programa já faz hoje. Só a aparência de "unidade
                // separada" muda nesta etapa.
                PopulationPolicy = StorageProviderPopulationPolicy.AlwaysFull,
                InSyncPolicy = StorageProviderInSyncPolicy.FileCreationTime
                    | StorageProviderInSyncPolicy.DirectoryCreationTime,
                HydrationPolicy = StorageProviderHydrationPolicy.Full,
                HydrationPolicyModifier = StorageProviderHydrationPolicyModifier.None,
                ShowSiblingsAsGroup = false,
            };

            StorageProviderSyncRootManager.Register(info);
            Console.WriteLine("OK: pasta registrada como unidade de sincronização.");
            return 0;
        }

        case "unregister":
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Uso: CloudFilterHost.exe unregister <caminho-da-pasta>");
                return 1;
            }
            string folderPath = args[1];
            var storageFolder = await StorageFolder.GetFolderFromPathAsync(folderPath);
            StorageProviderSyncRootManager.Unregister(
                StorageProviderSyncRootManager.GetSyncRootInformationForFolder(storageFolder).Id
            );
            Console.WriteLine("OK: unidade de sincronização removida.");
            return 0;
        }

        default:
            Console.WriteLine($"Comando desconhecido: {command}");
            return 1;
    }
}
catch (Exception ex)
{
    // Imprime o tipo exato da exceção e a mensagem completa de propósito —
    // isso é o que vou precisar ver, palavra por palavra, se algo der
    // errado no seu teste.
    Console.WriteLine($"ERRO: {ex.GetType().FullName}: {ex.Message}");
    if (ex.InnerException != null)
    {
        Console.WriteLine($"CAUSA INTERNA: {ex.InnerException.GetType().FullName}: {ex.InnerException.Message}");
    }
    return 1;
}
