// CloudFilterHost — programa auxiliar em C# chamado pelo programa Electron
// principal, porque a API de "unidade de sincronização" do Windows
// (Windows.Storage.Provider) só existe em C++/C#, não em JavaScript.
//
// ATENÇÃO: este código NÃO foi compilado nem testado ainda — o ambiente
// onde foi escrito não tem acesso ao Windows nem ao NuGet pra validar.
// A primeira vez que ele roda de verdade é na máquina de quem for testar.
//
// ETAPA 1 (já testada e funcionando): registrar/desregistrar uma pasta
// como "unidade de sincronização" com nome e ícone próprios.
//
// ETAPA 2 (esta adição, AINDA NÃO TESTADA): criar um arquivo de teste que
// aparece "vazio" (placeholder) e baixa um conteúdo fixo quando aberto —
// prova de conceito antes de conectar com os arquivos de verdade da
// Nuvem. Usa o pacote da comunidade Vanara.PInvoke.CldApi (não é da
// Microsoft, mas é bem estabelecido) em vez de eu escrever a comunicação
// de mais baixo nível do zero.
//
// Uso:
//   CloudFilterHost.exe check
//   CloudFilterHost.exe register <caminho-da-pasta> <nome-de-exibicao>
//   CloudFilterHost.exe unregister
//   CloudFilterHost.exe placeholder-test <caminho-da-pasta>

using System.Runtime.InteropServices;
using Vanara.PInvoke;
using Windows.Storage;
using Windows.Storage.Provider;
using static Vanara.PInvoke.CldApi;

// Fixo por enquanto — uma conta só. Se um dia o programa precisar
// sincronizar mais de uma conta/contrato como unidades separadas, cada
// uma precisa do seu próprio Id.
const string SyncRootId = "SupportMining.GestaoNuvem!ContaPadrao";

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
                Id = SyncRootId,
                Path = storageFolder,
                DisplayNameResource = displayName,
                // Ícone próprio do sistema, copiado junto do .exe na
                // publicação — referenciado por caminho relativo ao
                // próprio executável (AppContext.BaseDirectory), pra
                // funcionar não importa onde o programa for instalado.
                // ",0" no final = primeiro ícone dentro do arquivo .ico.
                IconResource = Path.Combine(AppContext.BaseDirectory, "icon.ico") + ",0",
                Version = "1.0.0",
                // AJUSTADO nesta etapa: pra placeholder funcionar, a
                // política de população precisa ser "Full" (usa
                // placeholder de verdade, não baixa tudo de cara) e a de
                // hidratação "Progressive" (baixa o conteúdo quando o
                // arquivo é aberto, não tudo de uma vez ao criar). Com
                // "AlwaysFull"/"Full" (como estava antes), CfCreatePlaceholders
                // falha com STATUS_CLOUD_FILE_NOT_SUPPORTED.
                PopulationPolicy = StorageProviderPopulationPolicy.Full,
                InSyncPolicy = StorageProviderInSyncPolicy.FileCreationTime
                    | StorageProviderInSyncPolicy.DirectoryCreationTime,
                HydrationPolicy = StorageProviderHydrationPolicy.Progressive,
                HydrationPolicyModifier = StorageProviderHydrationPolicyModifier.None,
                ShowSiblingsAsGroup = false,
            };

            StorageProviderSyncRootManager.Register(info);
            Console.WriteLine("OK: pasta registrada como unidade de sincronização.");
            return 0;
        }

        case "unregister":
        {
            try
            {
                // Usa o Id fixo direto, sem precisar procurar a partir da
                // pasta — GetSyncRootInformationForFolder exige marcações
                // no sistema de arquivos que só a etapa de placeholder
                // (ainda não implementada) cria; nesta etapa (só
                // registro), a busca por pasta falha mesmo com o registro
                // tendo funcionado.
                StorageProviderSyncRootManager.Unregister(SyncRootId);
                Console.WriteLine("OK: unidade de sincronização removida.");
            }
            catch (COMException ex) when (unchecked((uint)ex.HResult) == 0x80070490)
            {
                // ERROR_NOT_FOUND — já não tinha nada registrado com esse
                // Id. É o mesmo resultado final que a pessoa queria (nada
                // registrado), então não é um erro de verdade.
                Console.WriteLine("OK: já não havia nada registrado (nada a fazer).");
            }
            return 0;
        }

        case "placeholder-test":
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Uso: CloudFilterHost.exe placeholder-test <caminho-da-pasta>");
                return 1;
            }
            string folderPath = args[1];
            const string testFileName = "arquivo-de-teste-da-nuvem.txt";
            byte[] fakeContent = System.Text.Encoding.UTF8.GetBytes(
                "Este conteudo veio do callback de hidratacao (FETCH_DATA) - " +
                "prova de que o mecanismo de placeholder funciona, ainda sem " +
                "conectar com a Nuvem de verdade."
            );

            if (!Directory.Exists(folderPath))
            {
                Console.WriteLine($"ERRO: a pasta não existe: {folderPath}");
                return 1;
            }

            // O delegate PRECISA ficar vivo (referenciado) enquanto o
            // programa espera callback - se o coletor de lixo do .NET
            // recolher ele antes da hora, o callback quebra de um jeito
            // bem difícil de diagnosticar. Por isso é uma variável aqui
            // fora, não uma lambda descartável.
            CF_CALLBACK fetchDataCallback = (in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters) =>
            {
                Console.WriteLine("--> Callback FETCH_DATA disparado! O Windows pediu o conteúdo do arquivo.");
                try
                {
                    var opInfo = new CF_OPERATION_INFO
                    {
                        StructSize = (uint)Marshal.SizeOf<CF_OPERATION_INFO>(),
                        Type = CF_OPERATION_TYPE.CF_OPERATION_TYPE_TRANSFER_DATA,
                        ConnectionKey = callbackInfo.ConnectionKey,
                        TransferKey = callbackInfo.TransferKey,
                        RequestKey = callbackInfo.RequestKey,
                    };

                    unsafe
                    {
                        fixed (byte* pContent = fakeContent)
                        {
                            var opParams = new CF_OPERATION_PARAMETERS
                            {
                                ParamSize = (uint)Marshal.SizeOf<CF_OPERATION_PARAMETERS>(),
                            };
                            // TransferData é uma propriedade que devolve uma
                            // CÓPIA (não uma referência editável) — o C#
                            // recusa "opParams.TransferData.Campo = x" com
                            // erro CS1612 por isso. Precisa montar o valor
                            // inteiro de uma vez com "new()" (o tipo exato
                            // é inferido da própria propriedade) e atribuir
                            // tudo de uma só vez.
                            opParams.TransferData = new()
                            {
                                CompletionStatus = NTStatus.STATUS_SUCCESS,
                                Buffer = (IntPtr)pContent,
                                Offset = 0,
                                Length = fakeContent.Length,
                            };

                            var hr = CfExecute(opInfo, ref opParams);
                            Console.WriteLine($"    CfExecute (entregar conteúdo) resultado: 0x{hr:X8}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"    ERRO dentro do callback: {ex.GetType().FullName}: {ex.Message}");
                }
            };

            try
            {
                var callbackTable = new CF_CALLBACK_REGISTRATION[]
                {
                    new CF_CALLBACK_REGISTRATION
                    {
                        Type = CF_CALLBACK_TYPE.CF_CALLBACK_TYPE_FETCH_DATA,
                        Callback = fetchDataCallback,
                    },
                    CF_CALLBACK_REGISTRATION.CF_CALLBACK_REGISTRATION_END,
                };

                Console.WriteLine("Conectando ao sync root (CfConnectSyncRoot)...");
                var connectResult = CfConnectSyncRoot(
                    folderPath,
                    callbackTable,
                    IntPtr.Zero,
                    CF_CONNECT_FLAGS.CF_CONNECT_FLAG_REQUIRE_PROCESS_INFO,
                    out var connectionKey
                );
                if (connectResult.Failed)
                {
                    Console.WriteLine($"ERRO ao conectar: 0x{(uint)connectResult:X8}");
                    return 1;
                }
                Console.WriteLine("OK: conectado.");

                Console.WriteLine($"Criando placeholder de teste \"{testFileName}\"...");
                // FILETIME (formato de data/hora do Windows) pra agora —
                // suspeita principal do erro 0x8007017C (ERROR_CLOUD_FILE_
                // INVALID_REQUEST) da primeira tentativa: os campos de
                // data ficaram todos zerados, o que a criação de
                // placeholder aparentemente não aceita (zero costuma
                // significar "não mudar" em operações de ALTERAR, não faz
                // sentido numa CRIAÇÃO nova).
                //
                // O campo é do tipo FILETIME (struct de duas metades de
                // 32 bits), não um número de 64 bits direto — descoberto
                // no erro de compilação da tentativa anterior (CS0029).
                var now = ToFileTime(DateTime.UtcNow.ToFileTimeUtc());
                var placeholders = new CF_PLACEHOLDER_CREATE_INFO[]
                {
                    new CF_PLACEHOLDER_CREATE_INFO
                    {
                        RelativeFileName = testFileName,
                        FsMetadata = new CF_FS_METADATA
                        {
                            FileSize = fakeContent.Length,
                            BasicInfo = new Kernel32.FILE_BASIC_INFO
                            {
                                CreationTime = now,
                                LastAccessTime = now,
                                LastWriteTime = now,
                                ChangeTime = now,
                                FileAttributes = FileFlagsAndAttributes.FILE_ATTRIBUTE_NORMAL,
                            },
                        },
                        Flags = CF_PLACEHOLDER_CREATE_FLAGS.CF_PLACEHOLDER_CREATE_FLAG_MARK_IN_SYNC,
                    },
                };

                var createResult = CfCreatePlaceholders(
                    folderPath,
                    placeholders,
                    (uint)placeholders.Length,
                    CF_CREATE_FLAGS.CF_CREATE_FLAG_NONE,
                    out uint entriesProcessed
                );
                if (createResult.Failed)
                {
                    Console.WriteLine($"ERRO ao criar placeholder: 0x{(uint)createResult:X8}");
                    return 1;
                }
                Console.WriteLine($"OK: {entriesProcessed} placeholder(s) criado(s).");
                Console.WriteLine($"Resultado individual do arquivo: 0x{(uint)placeholders[0].Result:X8}");
                Console.WriteLine();
                Console.WriteLine(
                    $"Agora abra o arquivo \"{Path.Combine(folderPath, testFileName)}\" " +
                    "(no Bloco de Notas, por exemplo) e veja se aparece o texto de teste."
                );
                Console.WriteLine("Pressione Enter aqui para encerrar (e desconectar) quando terminar de testar.");
                Console.ReadLine();

                CfDisconnectSyncRoot(connectionKey);
                Console.WriteLine("Desconectado.");
                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ERRO: {ex.GetType().FullName} (HResult 0x{ex.HResult:X8}): {ex.Message}");
                return 1;
            }
        }

        default:
            Console.WriteLine($"Comando desconhecido: {command}");
            return 1;
    }
}
catch (Exception ex)
{
    // Imprime o tipo exato da exceção, o código de erro do Windows em
    // hexadecimal (HResult) e a mensagem — o HResult é o que realmente
    // identifica o erro quando (como aconteceu) a mensagem vem vazia.
    Console.WriteLine($"ERRO: {ex.GetType().FullName} (HResult 0x{ex.HResult:X8}): {ex.Message}");
    if (ex.InnerException != null)
    {
        Console.WriteLine(
            $"CAUSA INTERNA: {ex.InnerException.GetType().FullName} (HResult 0x{ex.InnerException.HResult:X8}): {ex.InnerException.Message}"
        );
    }
    return 1;
}

// Converte um valor de data/hora do .NET (número de 64 bits) pro formato
// FILETIME do Windows (duas metades de 32 bits) — usado nos campos de
// data/hora exigidos na criação de um placeholder.
static System.Runtime.InteropServices.ComTypes.FILETIME ToFileTime(long fileTime) => new()
{
    dwLowDateTime = unchecked((int)(fileTime & 0xFFFFFFFF)),
    dwHighDateTime = unchecked((int)(fileTime >> 32)),
};
