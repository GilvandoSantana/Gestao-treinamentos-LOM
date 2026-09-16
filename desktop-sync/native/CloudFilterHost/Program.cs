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
//   CloudFilterHost.exe placeholder-real-test <caminho-da-pasta> <nome-do-arquivo> <tamanho-em-bytes> <link-de-download>
//   CloudFilterHost.exe sync-tree <pasta-local> <manifesto.json> <servidor> <token>

using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
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
        case "sync-self-test":
            return SyncPathSafety.RunSelfTest();

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
                // CORRIGIDO (achei o exemplo oficial testado do próprio
                // mantenedor do pacote Vanara e ele usa exatamente estes
                // dois valores — o oposto do que eu tinha "corrigido" na
                // tentativa anterior). Os nomes destes valores no WinRT
                // (StorageProviderPopulationPolicy/HydrationPolicy) NÃO
                // significam a mesma coisa que os nomes parecidos da API
                // nativa (CF_HYDRATION_POLICY_ALWAYS_FULL) — são dois
                // sistemas de tipos diferentes, apesar do nome parecido.
                PopulationPolicy = StorageProviderPopulationPolicy.AlwaysFull,
                InSyncPolicy = StorageProviderInSyncPolicy.FileCreationTime
                    | StorageProviderInSyncPolicy.DirectoryCreationTime,
                HydrationPolicy = StorageProviderHydrationPolicy.Full,
                HydrationPolicyModifier = StorageProviderHydrationPolicyModifier.None,
                ShowSiblingsAsGroup = false,
            };

            StorageProviderSyncRootManager.Register(info);
            // O exemplo oficial do Vanara espera 1 segundo depois de
            // registrar "pra dar tempo do cache invalidar" — mesmo não
            // sendo a causa mais provável do erro atual, é uma espera
            // barata que não custa nada incluir.
            Thread.Sleep(1000);
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
                    CF_CONNECT_FLAGS.CF_CONNECT_FLAG_NONE,
                    out var connectionKey
                );
                if (connectResult.Failed)
                {
                    Console.WriteLine($"ERRO ao conectar: 0x{(uint)connectResult:X8}");
                    return 1;
                }
                Console.WriteLine("OK: conectado.");

                Console.WriteLine($"Criando placeholder de teste \"{testFileName}\"...");
                // FILETIME (formato de data/hora do Windows) pra agora.
                var now = ToFileTime(DateTime.UtcNow.ToFileTimeUtc());

                // NOVA TENTATIVA: FileIdentity — um "identificador" opaco
                // que o programa anexa ao arquivo, e que volta identico
                // nos callbacks futuros (é assim que, na versão real
                // conectada à Nuvem, o FETCH_DATA vai saber QUAL arquivo
                // da Nuvem baixar). A documentação diz que é opcional só
                // para PASTAS — para ARQUIVOS pode ser obrigatório, e eu
                // tinha deixado vazio em todas as tentativas anteriores.
                // Uso o próprio nome do arquivo como identidade, por
                // enquanto.
                byte[] fileIdentityBytes = System.Text.Encoding.Unicode.GetBytes(testFileName);

                CF_PLACEHOLDER_CREATE_INFO[] placeholders;
                uint entriesProcessed;

                unsafe
                {
                    fixed (byte* pIdentity = fileIdentityBytes)
                    {
                        placeholders = new CF_PLACEHOLDER_CREATE_INFO[]
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
                                FileIdentity = (IntPtr)pIdentity,
                                FileIdentityLength = (uint)fileIdentityBytes.Length,
                                Flags = CF_PLACEHOLDER_CREATE_FLAGS.CF_PLACEHOLDER_CREATE_FLAG_NONE,
                            },
                        };

                        var createResult = CfCreatePlaceholders(
                            folderPath,
                            placeholders,
                            (uint)placeholders.Length,
                            CF_CREATE_FLAGS.CF_CREATE_FLAG_NONE,
                            out entriesProcessed
                        );
                        if (createResult.Failed)
                        {
                            Console.WriteLine($"ERRO ao criar placeholder: 0x{(uint)createResult:X8}");
                            return 1;
                        }
                    }
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

        case "placeholder-real-test":
        {
            // Igual ao placeholder-test, mas com um arquivo DE VERDADE da
            // Nuvem em vez de conteúdo fixo — usa o link de download que
            // o script get-real-file-for-test.js gera. Ainda um teste
            // isolado (não integrado ao programa Electron principal
            // ainda) — o próximo passo depois deste funcionar.
            if (args.Length < 5)
            {
                Console.WriteLine(
                    "Uso: CloudFilterHost.exe placeholder-real-test <caminho-da-pasta> <nome-do-arquivo> <tamanho-em-bytes> <link-de-download>"
                );
                return 1;
            }
            string realFolderPath = args[1];
            string realFileName = args[2];
            long realFileSize = long.Parse(args[3]);
            string downloadUrl = args[4];

            if (!Directory.Exists(realFolderPath))
            {
                Console.WriteLine($"ERRO: a pasta não existe: {realFolderPath}");
                return 1;
            }

            using var httpClient = new System.Net.Http.HttpClient();

            CF_CALLBACK fetchRealDataCallback = (in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters) =>
            {
                Console.WriteLine("--> Callback FETCH_DATA disparado! Baixando o conteúdo de verdade da Nuvem...");
                try
                {
                    // Bloqueia aqui de propósito (.Result em vez de await)
                    // — o callback do CfAPI não é assíncrono; numa versão
                    // futura mais robusta isso merece um cuidado melhor,
                    // mas pra este teste isolado é suficiente.
                    byte[] realContent = httpClient.GetByteArrayAsync(downloadUrl).GetAwaiter().GetResult();
                    Console.WriteLine($"    Baixados {realContent.Length} bytes de verdade da Nuvem.");

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
                        fixed (byte* pContent = realContent)
                        {
                            var opParams = new CF_OPERATION_PARAMETERS
                            {
                                ParamSize = (uint)Marshal.SizeOf<CF_OPERATION_PARAMETERS>(),
                            };
                            opParams.TransferData = new()
                            {
                                CompletionStatus = NTStatus.STATUS_SUCCESS,
                                Buffer = (IntPtr)pContent,
                                Offset = 0,
                                Length = realContent.Length,
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
                        Callback = fetchRealDataCallback,
                    },
                    CF_CALLBACK_REGISTRATION.CF_CALLBACK_REGISTRATION_END,
                };

                Console.WriteLine("Conectando ao sync root (CfConnectSyncRoot)...");
                var connectResult = CfConnectSyncRoot(
                    realFolderPath,
                    callbackTable,
                    IntPtr.Zero,
                    CF_CONNECT_FLAGS.CF_CONNECT_FLAG_NONE,
                    out var connectionKey
                );
                if (connectResult.Failed)
                {
                    Console.WriteLine($"ERRO ao conectar: 0x{(uint)connectResult:X8}");
                    return 1;
                }
                Console.WriteLine("OK: conectado.");

                Console.WriteLine($"Criando placeholder \"{realFileName}\" ({realFileSize} bytes)...");
                var now = ToFileTime(DateTime.UtcNow.ToFileTimeUtc());
                byte[] fileIdentityBytes = System.Text.Encoding.Unicode.GetBytes(realFileName);

                CF_PLACEHOLDER_CREATE_INFO[] placeholders;
                uint entriesProcessed;

                unsafe
                {
                    fixed (byte* pIdentity = fileIdentityBytes)
                    {
                        placeholders = new CF_PLACEHOLDER_CREATE_INFO[]
                        {
                            new CF_PLACEHOLDER_CREATE_INFO
                            {
                                RelativeFileName = realFileName,
                                FsMetadata = new CF_FS_METADATA
                                {
                                    FileSize = realFileSize,
                                    BasicInfo = new Kernel32.FILE_BASIC_INFO
                                    {
                                        CreationTime = now,
                                        LastAccessTime = now,
                                        LastWriteTime = now,
                                        ChangeTime = now,
                                        FileAttributes = FileFlagsAndAttributes.FILE_ATTRIBUTE_NORMAL,
                                    },
                                },
                                FileIdentity = (IntPtr)pIdentity,
                                FileIdentityLength = (uint)fileIdentityBytes.Length,
                                Flags = CF_PLACEHOLDER_CREATE_FLAGS.CF_PLACEHOLDER_CREATE_FLAG_NONE,
                            },
                        };

                        var createResult = CfCreatePlaceholders(
                            realFolderPath,
                            placeholders,
                            (uint)placeholders.Length,
                            CF_CREATE_FLAGS.CF_CREATE_FLAG_NONE,
                            out entriesProcessed
                        );
                        if (createResult.Failed)
                        {
                            Console.WriteLine($"ERRO ao criar placeholder: 0x{(uint)createResult:X8}");
                            return 1;
                        }
                    }
                }
                Console.WriteLine($"OK: {entriesProcessed} placeholder(s) criado(s).");
                Console.WriteLine($"Resultado individual do arquivo: 0x{(uint)placeholders[0].Result:X8}");
                Console.WriteLine();
                Console.WriteLine(
                    $"Agora abra o arquivo \"{Path.Combine(realFolderPath, realFileName)}\" e confira se o " +
                    "conteúdo bate com o arquivo de verdade da Nuvem."
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

        case "sync-tree":
        {
            // Etapa de integração real: em vez de UM arquivo de teste,
            // recria a ÁRVORE INTEIRA de pastas/arquivos da Nuvem como
            // placeholders, a partir de um manifesto gerado pelo script
            // generate-manifest.js. Continua sendo um teste isolado (não
            // chamado pelo programa Electron ainda).
            if (args.Length < 5)
            {
                Console.WriteLine("Uso: CloudFilterHost.exe sync-tree <pasta-local> <manifesto.json> <servidor> <token>");
                return 1;
            }
            string rootPath = args[1];
            string manifestPath = args[2];
            string apiServerUrl = args[3].TrimEnd('/');
            string bearerToken = args[4];

            if (!Directory.Exists(rootPath))
            {
                Console.WriteLine($"ERRO: a pasta não existe: {rootPath}");
                return 1;
            }
            if (!File.Exists(manifestPath))
            {
                Console.WriteLine($"ERRO: manifesto não encontrado: {manifestPath}");
                return 1;
            }

            var manifestJson = File.ReadAllText(manifestPath);
            var manifest = JsonSerializer.Deserialize<ManifestRoot>(
                manifestJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
            if (manifest?.Entries == null)
            {
                Console.WriteLine("ERRO: manifesto inválido ou vazio.");
                return 1;
            }
            Console.WriteLine($"Manifesto lido: {manifest.Entries.Count(e => !e.IsFolder)} arquivo(s), {manifest.Entries.Count(e => e.IsFolder)} pasta(s).");

            using var httpClient = new System.Net.Http.HttpClient();

            // Callback FETCH_DATA: lê o ID do arquivo de volta do
            // FileIdentity (gravado na criação do placeholder), busca um
            // link de download ATUALIZADO na Nuvem (o link assinado
            // expira em 1 hora — busca um novo a cada abertura em vez de
            // guardar um fixo, pra funcionar mesmo dias depois), baixa o
            // conteúdo de verdade, entrega pro Windows.
            //
            // Repete até 3 vezes se algo falhar no meio do caminho (rede
            // instável, uma resposta lenta, etc.) antes de desistir de
            // verdade — sem isso, uma falha passageira significava o
            // arquivo nunca mais carregar (achado real, Gilvando: "carrega
            // alguns arquivos e outros não" — o problema batia com uma
            // simples falha de rede sem nenhuma nova tentativa).
            //
            // Também importante: se mesmo depois de tentar 3 vezes ainda
            // falhar, agora AVISA o Windows explicitamente que a busca
            // falhou (STATUS_UNSUCCESSFUL) — antes, sem isso, o Windows
            // ficava esperando uma resposta que nunca chegava, e o
            // arquivo parecia só "travado carregando" pra sempre, sem
            // nenhum erro claro pra pessoa perceber e tentar de novo.
            CF_CALLBACK fetchDataCallback = (in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters) =>
            {
                string fileId = Marshal.PtrToStringUni(
                    callbackInfo.FileIdentity,
                    (int)(callbackInfo.FileIdentityLength / 2)
                ) ?? "";
                Console.WriteLine($"--> FETCH_DATA: \"{callbackInfo.NormalizedPath}\" (id da Nuvem: {fileId})");

                const int maxAttempts = 3;
                byte[]? realContent = null;
                Exception? lastError = null;

                for (int attempt = 1; attempt <= maxAttempts && realContent == null; attempt++)
                {
                    try
                    {
                        if (attempt > 1)
                        {
                            Console.WriteLine($"    Tentativa {attempt}/{maxAttempts}...");
                            System.Threading.Thread.Sleep(1500);
                        }

                        string requestBody = "{\"0\":{\"json\":{\"id\":\"" + fileId.Replace("\"", "\\\"") + "\"}}}";
                        var urlRequest = new System.Net.Http.HttpRequestMessage(
                            System.Net.Http.HttpMethod.Post,
                            $"{apiServerUrl}/api/trpc/cloud.getDownloadUrl?batch=1"
                        )
                        {
                            Content = new System.Net.Http.StringContent(
                                requestBody,
                                System.Text.Encoding.UTF8,
                                "application/json"
                            ),
                        };
                        urlRequest.Headers.Add("Authorization", $"Bearer {bearerToken}");
                        urlRequest.Headers.Add("Origin", apiServerUrl);

                        var urlResponse = httpClient.SendAsync(urlRequest).GetAwaiter().GetResult();
                        string urlResponseText = urlResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                        using var urlDoc = JsonDocument.Parse(urlResponseText);
                        string downloadUrl = urlDoc.RootElement[0]
                            .GetProperty("result").GetProperty("data").GetProperty("json").GetProperty("url").GetString()!;

                        realContent = httpClient.GetByteArrayAsync(downloadUrl).GetAwaiter().GetResult();
                        Console.WriteLine($"    Baixados {realContent.Length} bytes.");
                    }
                    catch (Exception ex)
                    {
                        lastError = ex;
                        Console.WriteLine($"    Tentativa {attempt}/{maxAttempts} falhou: {ex.GetType().FullName}: {ex.Message}");
                    }
                }

                var opInfo = new CF_OPERATION_INFO
                {
                    StructSize = (uint)Marshal.SizeOf<CF_OPERATION_INFO>(),
                    Type = CF_OPERATION_TYPE.CF_OPERATION_TYPE_TRANSFER_DATA,
                    ConnectionKey = callbackInfo.ConnectionKey,
                    TransferKey = callbackInfo.TransferKey,
                    RequestKey = callbackInfo.RequestKey,
                };

                if (realContent == null)
                {
                    Console.WriteLine($"    ERRO: desisti depois de {maxAttempts} tentativas ({lastError?.Message}). Avisando o Windows que falhou.");
                    var failParams = new CF_OPERATION_PARAMETERS
                    {
                        ParamSize = (uint)Marshal.SizeOf<CF_OPERATION_PARAMETERS>(),
                    };
                    failParams.TransferData = new()
                    {
                        CompletionStatus = NTStatus.STATUS_UNSUCCESSFUL,
                        Buffer = IntPtr.Zero,
                        Offset = 0,
                        Length = 0,
                    };
                    CfExecute(opInfo, ref failParams);
                    return;
                }

                try
                {
                    unsafe
                    {
                        fixed (byte* pContent = realContent)
                        {
                            var opParams = new CF_OPERATION_PARAMETERS
                            {
                                ParamSize = (uint)Marshal.SizeOf<CF_OPERATION_PARAMETERS>(),
                            };
                            opParams.TransferData = new()
                            {
                                CompletionStatus = NTStatus.STATUS_SUCCESS,
                                Buffer = (IntPtr)pContent,
                                Offset = 0,
                                Length = realContent.Length,
                            };
                            var hr = CfExecute(opInfo, ref opParams);
                            Console.WriteLine($"    CfExecute resultado: 0x{hr:X8}");
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
                    rootPath,
                    callbackTable,
                    IntPtr.Zero,
                    CF_CONNECT_FLAGS.CF_CONNECT_FLAG_NONE,
                    out var connectionKey
                );
                if (connectResult.Failed)
                {
                    Console.WriteLine($"ERRO ao conectar: 0x{(uint)connectResult:X8}");
                    return 1;
                }
                Console.WriteLine("OK: conectado.");

                // Só um registro informativo agora (achado real,
                // Gilvando, 14/09: nunca é limpo, então usar isso como
                // FILTRO pra pular a checagem de disco fazia um item
                // apagado localmente — por exemplo, por engano — nunca
                // mais ser recriado, mesmo voltando a aparecer no
                // manifesto). A decisão de criar ou não agora é sempre
                // baseada no disco de verdade (File.Exists/
                // Directory.Exists logo abaixo), nunca neste cache.
                var statePath = manifestPath + ".materialized.json";
                var materialized = File.Exists(statePath)
                    ? JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(statePath)) ?? new()
                    : new Dictionary<string, string>();
                var createdPaths = new HashSet<string>(materialized.Keys, StringComparer.OrdinalIgnoreCase);
                string Identity(ManifestEntryItem e) => e.IsFolder ? e.FolderId : e.FileId;
                void SaveMaterialized()
                {
                    var temp = statePath + ".tmp";
                    File.WriteAllText(temp, JsonSerializer.Serialize(materialized));
                    File.Move(temp, statePath, true);
                }
                bool IsSafe(string relative)
                {
                    try { SyncPathSafety.Resolve(rootPath, relative); return true; }
                    catch (Exception error) { Console.WriteLine($"ERRO caminho recusado: {error.Message}"); return false; }
                }
                bool WasRemoved(ManifestEntryItem entry)
                {
                    // A missing item that was already materialized is a local deletion,
                    // even when the cloud manifest still includes it. Never recreate it.
                    return SyncPathSafety.WasRemoved(rootPath, entry.RelativePath, createdPaths);
                }

                void ApplyManifest(ManifestRoot manifestToApply)
                {
                    var validEntries = manifestToApply.Entries!.Where(e => IsSafe(e.RelativePath)).ToList();
                    var currentPaths = validEntries.ToDictionary(e => e.RelativePath, Identity, StringComparer.OrdinalIgnoreCase);
                    foreach (var old in materialized.Keys.ToArray())
                    {
                        if (!currentPaths.TryGetValue(old, out var id) || id != materialized[old])
                        { materialized.Remove(old); createdPaths.Remove(old); }
                    }
                    SaveMaterialized();
                    // Agrupa os arquivos do manifesto por pasta
                    // (CfCreatePlaceholders exige uma chamada por pasta,
                    // não uma chamada só pra árvore inteira) — só os que
                    // ainda não foram criados numa passada anterior E que
                    // ainda não existem de verdade no disco.
                    //
                    // O segundo filtro (File.Exists) é o que faltava:
                    // achado real (Gilvando, 01/09) — um arquivo criado
                    // pela PESSOA direto na pasta (que já sobe sozinho pra
                    // Nuvem desde a etapa anterior) aparece, na consulta
                    // seguinte à Nuvem, como se fosse um arquivo "novo"
                    // vindo de lá — mas ele já existe no disco de verdade
                    // (não como placeholder), então tentar criar um
                    // placeholder em cima dele dá erro "já existe"
                    // (0x800700B7 / ERROR_ALREADY_EXISTS).
                    //
                    // Achado real (Gilvando, 14/09): antes, o filtro
                    // "!createdPaths.Contains(...)" pulava esta checagem
                    // inteira pra qualquer caminho já marcado como
                    // "resolvido" alguma vez — mas createdPaths nunca é
                    // limpo, nem quando o lado JavaScript apaga um
                    // arquivo/pasta local (por exemplo, achando por
                    // engano que sumiu da Nuvem). Resultado: se algo
                    // fosse apagado localmente depois de já ter sido
                    // marcado como criado, este processo NUNCA MAIS
                    // recriava, mesmo com o manifesto voltando a mostrar
                    // que devia existir — o item simplesmente sumia da
                    // pasta sincronizada pra sempre, mesmo já estando de
                    // volta na Nuvem. Corrigido confiando sempre na
                    // checagem real do disco (File.Exists/Directory.Exists
                    // abaixo), não mais num cache que pode ficar
                    // desatualizado.
                    var fileEntries = validEntries
                        .Where(e => !WasRemoved(e))
                        .Where(e => !e.IsFolder)
                        .Where(e =>
                        {
                            if (File.Exists(Path.Combine(rootPath, e.RelativePath)))
                            {
                                // Já existe de verdade — provavelmente a
                                // pessoa criou/editou local e já subiu
                                // sozinho. Marca como "resolvido" pra não
                                // ficar checando de novo a cada ciclo.
                                createdPaths.Add(e.RelativePath);
                                materialized[e.RelativePath] = Identity(e);
                                return false;
                            }
                            return true;
                        })
                        .ToList();
                    var folderEntries = validEntries
                        .Where(e => !WasRemoved(e))
                        .Where(e => e.IsFolder)
                        .Where(e =>
                        {
                            if (Directory.Exists(Path.Combine(rootPath, e.RelativePath)))
                            {
                                // Mesma lógica do File.Exists acima, agora
                                // espelhada pra pasta (achado real,
                                // Gilvando, 11/09: faltava essa proteção
                                // aqui — combinado com a falta de proteção
                                // equivalente no servidor na época, isso
                                // contribuiu pra pasta aparecer duplicada
                                // na Nuvem). Pasta já existe de verdade no
                                // disco (não é placeholder, é pasta real
                                // desde a criação) — marca como
                                // "resolvida" sem tentar recriar.
                                createdPaths.Add(e.RelativePath);
                                materialized[e.RelativePath] = Identity(e);
                                return false;
                            }
                            return true;
                        })
                        .ToList();

                    // Cria as pastas marcadas explicitamente no manifesto —
                    // inclusive as vazias (ou que só têm outra pasta vazia
                    // dentro) — antes de mexer em qualquer arquivo.
                    // Directory.CreateDirectory já cria os pais que
                    // faltarem sozinho, então a ordem aqui não importa.
                    foreach (var folderEntry in folderEntries)
                    {
                        Directory.CreateDirectory(Path.Combine(rootPath, folderEntry.RelativePath));
                        createdPaths.Add(folderEntry.RelativePath);
                        materialized[folderEntry.RelativePath] = Identity(folderEntry);
                        SaveMaterialized();
                    }

                    var byFolder = new Dictionary<string, List<ManifestEntryItem>>();
                    foreach (var entry in fileEntries)
                    {
                        string dir = Path.GetDirectoryName(entry.RelativePath) ?? "";
                        if (!byFolder.TryGetValue(dir, out var list))
                        {
                            list = new List<ManifestEntryItem>();
                            byFolder[dir] = list;
                        }
                        list.Add(entry);
                    }

                    // Cria as pastas de verdade primeiro, da mais rasa pra
                    // mais funda, garantindo que a pasta pai sempre existe
                    // antes de tentar criar a filha.
                    foreach (var dir in byFolder.Keys.Where(d => !string.IsNullOrEmpty(d)).OrderBy(d => d.Split('\\').Length))
                    {
                        Directory.CreateDirectory(Path.Combine(rootPath, dir));
                    }

                    int totalCreatedNow = 0;
                    int totalErrorsNow = 0;
                    foreach (var kvp in byFolder)
                    {
                        string dir = kvp.Key;
                        List<ManifestEntryItem> files = kvp.Value;
                        string fullDirPath = string.IsNullOrEmpty(dir) ? rootPath : Path.Combine(rootPath, dir);
                        var now = ToFileTime(DateTime.UtcNow.ToFileTimeUtc());

                        // GCHandle (em vez de "fixed") porque aqui
                        // precisamos fixar VÁRIOS blocos de memória
                        // diferentes (um por arquivo) ao mesmo tempo, até a
                        // chamada terminar — "fixed" só fixa um bloco por
                        // vez.
                        var handles = new List<GCHandle>();
                        try
                        {
                            var placeholders = new CF_PLACEHOLDER_CREATE_INFO[files.Count];
                            for (int i = 0; i < files.Count; i++)
                            {
                                byte[] idBytes = System.Text.Encoding.Unicode.GetBytes(files[i].FileId);
                                var handle = GCHandle.Alloc(idBytes, GCHandleType.Pinned);
                                handles.Add(handle);

                                placeholders[i] = new CF_PLACEHOLDER_CREATE_INFO
                                {
                                    RelativeFileName = Path.GetFileName(files[i].RelativePath),
                                    FsMetadata = new CF_FS_METADATA
                                    {
                                        FileSize = files[i].FileSize,
                                        BasicInfo = new Kernel32.FILE_BASIC_INFO
                                        {
                                            CreationTime = now,
                                            LastAccessTime = now,
                                            LastWriteTime = DateTime.TryParse(files[i].UpdatedAt, out var updatedAt) ? ToFileTime(updatedAt.ToUniversalTime().ToFileTimeUtc()) : now,
                                            ChangeTime = now,
                                            FileAttributes = FileFlagsAndAttributes.FILE_ATTRIBUTE_NORMAL,
                                        },
                                    },
                                    FileIdentity = handle.AddrOfPinnedObject(),
                                    FileIdentityLength = (uint)idBytes.Length,
                                    Flags = CF_PLACEHOLDER_CREATE_FLAGS.CF_PLACEHOLDER_CREATE_FLAG_NONE,
                                };
                            }

                            var createResult = CfCreatePlaceholders(
                                fullDirPath,
                                placeholders,
                                (uint)placeholders.Length,
                                CF_CREATE_FLAGS.CF_CREATE_FLAG_NONE,
                                out uint processed
                            );
                            if (createResult.Failed)
                            {
                                Console.WriteLine($"ERRO ao criar placeholders em \"{dir}\": 0x{(uint)createResult:X8}");
                                totalErrorsNow++;
                                continue;
                            }
                            totalCreatedNow += (int)processed;
                            foreach (var f in files.Where(f => File.Exists(SyncPathSafety.Resolve(rootPath, f.RelativePath))))
                            { createdPaths.Add(f.RelativePath); materialized[f.RelativePath] = Identity(f); }
                            SaveMaterialized();
                        }
                        finally
                        {
                            foreach (var h in handles) h.Free();
                        }
                    }

                    SaveMaterialized();
                    if (totalCreatedNow >= 0 || totalErrorsNow > 0)
                    {
                        Console.WriteLine($"OK: {totalCreatedNow} placeholder(s) novo(s) criado(s) ({totalErrorsNow} pasta(s) com erro).");
                    }
                }

                ApplyManifest(manifest);

                Console.WriteLine();
                Console.WriteLine("Navegue pela pasta e abra qualquer arquivo — deve baixar na hora.");
                Console.WriteLine("Verificando a Nuvem de novo a cada 5 segundos, pra pegar arquivo/pasta novos...");

                // Fica rodando pra sempre, checando a Nuvem de novo
                // periodicamente (o programa Electron reescreve o mesmo
                // arquivo de manifesto com dados atualizados) — só termina
                // quando o processo for encerrado por fora (o programa
                // Electron, ao desconectar ou fechar). O próprio Windows
                // cuida da limpeza da conexão automaticamente nesse caso,
                // mesmo sem chamar CfDisconnectSyncRoot explicitamente.
                //
                // Antes 30s — diminuído a pedido do Gilvando (11/09). Esta
                // releitura é só de um ARQUIVO LOCAL (sem custo de rede,
                // quem já pagou o custo de ir até o servidor foi o lado
                // Electron, ao gerar o manifesto) — por isso pode ficar
                // mais curto que o intervalo do lado Electron
                // (MANIFEST_REFRESH_INTERVAL_MS, 10s): assim que o
                // manifesto novo chega no disco, este processo pega ele
                // quase na hora, em vez de esperar mais um ciclo inteiro
                // por cima do que o Electron já esperou.
                while (true)
                {
                    Thread.Sleep(5_000);
                    try
                    {
                        if (!File.Exists(manifestPath)) continue;
                        var freshJson = File.ReadAllText(manifestPath);
                        var freshManifest = JsonSerializer.Deserialize<ManifestRoot>(
                            freshJson,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                        if (freshManifest?.Entries != null)
                        {
                            ApplyManifest(freshManifest);
                        }
                    }
                    catch (Exception ex)
                    {
                        // Provavelmente pegou o arquivo no meio de ser
                        // reescrito pelo programa Electron — tenta de novo
                        // no próximo ciclo, sem derrubar o processo.
                        Console.WriteLine($"Aviso: falha ao reler o manifesto ({ex.GetType().Name}) — tentando de novo em 30s.");
                    }
                }
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

// Classes usadas só pra ler o manifesto JSON gerado pelo
// generate-manifest.js no comando sync-tree.
class ManifestRoot
{
    public List<ManifestEntryItem>? Entries { get; set; }
}

class ManifestEntryItem
{
    public string RelativePath { get; set; } = "";
    public string FileId { get; set; } = "";
    public string FolderId { get; set; } = "";
    public string? UpdatedAt { get; set; }
    public long FileSize { get; set; }
    // Pasta sem nenhum arquivo direto dentro dela (mas que existe na
    // Nuvem, e pode ter subpastas por dentro) — sem marcar isso
    // explicitamente, uma pasta vazia nunca aparecia no computador,
    // porque o programa só "descobria" pasta ao ver arquivo dentro dela.
    public bool IsFolder { get; set; }
}
