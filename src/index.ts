import cliPath from "@nocom_bot/cli";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createInterface } from "node:readline";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import * as Git from "isomorphic-git";
import GitHTTP from 'isomorphic-git/http/node';
import { Command, Option } from "commander";
import { exec as execCB } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execCB);

type ModuleMetadata = {
    mode: "git",
    url: string,
    commit: string
};

const MODULE_TABLE: {
    [x: string]: ModuleMetadata
} = {
    mod_telegram: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_telegram.git",
        commit: "df9e79853916c8c45605a762616e3e23cc1e4f48"
    },
    mod_discord: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_discord.git",
        commit: "2c8f13375c0bce0fbb48a70e7e1535c51059a6ec"
    },
    mod_fbmsg_legacy: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_fbmsg_legacy.git",
        commit: "4d9ce388dcc2853ac913ee03ddde700a1a49b043"
    },
    mod_database_json: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_database_json.git",
        commit: "11765c5cd865af8e9ba62d749d6d79f37d54a594"
    },
    mod_pluginhandler_a: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_pluginhandler_a.git",
        commit: "377d0c0bedcc465baa6abf627c4189c147979648"
    },
    mod_command_handler: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_command_handler.git",
        commit: "9e3df08dcf313f38ba529481aea0b0e118e246d7"
    }
}

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ""
});

const program = new Command("c3cbot");

program
    .helpOption("-h, --help", "Show this help message")
    .addOption(
        new Option("-p, --profile <path>", "Specify user data directory for C3CBot")
            .env("C3CBOT_PROFILE").default("~/.nocom/profile_c3cbot_beta1")
    )
    .addOption(
        new Option("-l, --log-level <level>", "Specify console output log level")
            .choices(["silent", "critical", "error", "warn", "info", "debug", "verbose"])
            .env("C3CBOT_LOG_LEVEL").default("info")
    )
    /*.addOption(
        new Option("-s, --setup", "Initialize setup process, useful when you want to change settings")
    )*/;

program.parse(process.argv);

const opts = program.opts();

// Correctly parse the profile path (resolve ~)
const profilePath = path.resolve(process.cwd(), opts.profile.replace(/^~/, os.homedir()));

// Create the profile directory if it doesn't exist
if (!fsSync.existsSync(profilePath)) {
    await fs.mkdir(profilePath, { recursive: true });
}

// Create the logs directory if it doesn't exist
const logPath = path.join(profilePath, "logs");
if (!fsSync.existsSync(logPath)) {
    await fs.mkdir(logPath);
}

// Create the module directory if it doesn't exist
const modulePath = path.join(profilePath, "modules");
if (!fsSync.existsSync(modulePath)) {
    await fs.mkdir(modulePath);
}

// Create the plugin directory if it doesn't exist
const pluginPath = path.join(profilePath, "plugins");
if (!fsSync.existsSync(pluginPath)) {
    await fs.mkdir(pluginPath);
}

// Create the data directory if it doesn't exist
const dataPath = path.join(profilePath, "data");
if (!fsSync.existsSync(dataPath)) {
    await fs.mkdir(dataPath);
}

// Create temp directory if it doesn't exist
const tempPath = path.join(profilePath, "temp");
if (!fsSync.existsSync(tempPath)) {
    await fs.mkdir(tempPath);
}

// Test config.json
const configPath = path.join(profilePath, "config.json");
if (!fsSync.existsSync(configPath)) {
    // Config file doesn't exist, starting interactive setup
    console.log("Config file doesn't exist, starting setup...");

    let accounts = [];
    console.log("Please add an account for C3CBot to use.");
    for (; ;) {
        // Valid account types are Facebook, Discord and Telegram.

        // Get account type
        let accountType = (await new Promise<string>((resolve) => {
            rl.question("Account type (facebook, discord, telegram): ", (answer) => {
                resolve(answer);
            });
        })).trim().toLowerCase();

        // Get information based on account type
        if (accountType === "discord") {
            // Discord account
            // Ask for token
            let token = (await new Promise<string>((resolve) => {
                rl.question("Discord bot token: ", (answer) => {
                    resolve(answer);
                });
            })).trim();

            // Yes/No question: Do you want to enable slash commands?
            let slashCommands = (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to enable slash commands? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            }));

            let applicationId: string = "";
            if (slashCommands) {
                // Ask for application ID
                applicationId = (await new Promise<string>((resolve) => {
                    rl.question("Discord application ID: ", (answer) => {
                        resolve(answer);
                    });
                })).trim();
            }

            // Yes/No question: Do you want to enable regular message commands?
            let messageCommands = (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to enable regular message commands? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            }));

            // Yes/No question: Do you want to accept commands from DMs?
            let acceptCommandsFromDMs = (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to accept commands from DMs? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            }));

            // Add account to accounts array
            accounts.push({
                shortName: "int_discord",
                loginData: {
                    token,
                    ...(slashCommands ? { applicationID: applicationId } : {}),
                    disableSlashCommand: !slashCommands,
                    intents: [
                        ...(messageCommands ? ["Guilds", "GuildMessages", "MessageContent"] : []),
                        ...(acceptCommandsFromDMs ? ["DirectMessages"] : [])
                    ]
                },
                id: 0
            });
        } else if (accountType === "telegram") {
            // Telegram account
            // Ask for token
            let token = (await new Promise<string>((resolve) => {
                rl.question("Telegram bot token: ", (answer) => {
                    resolve(answer);
                });
            })).trim();

            // Add account to accounts array
            accounts.push({
                shortName: "int_telegram",
                loginData: {
                    botToken: token
                },
                id: 0
            });
        } else if (accountType === "facebook") {
            // Facebook account
            let sessionFileID = crypto.randomBytes(16).toString("hex");
            let importedSessionFile = false;

            // Yes/No question: Do you want to import existing session/appstate file?
            let importSession = (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to import existing session/appstate file? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            }));

            if (importSession) {
                for (; ;) {
                    // Ask for session file path
                    let sessionPath = (await new Promise<string>((resolve) => {
                        rl.question("Session/appstate file path: ", (answer) => {
                            resolve(answer);
                        });
                    })).trim();

                    // Resolve path to absolute path
                    let absoluteSessionPath = path.resolve(process.cwd(), sessionPath.replace(/^~/, os.homedir()));

                    // Check if file exists
                    if (!fsSync.existsSync(absoluteSessionPath)) {
                        console.log("File doesn't exist, please try again.");
                        continue;
                    }

                    // Check if file is a file
                    if (!fsSync.statSync(absoluteSessionPath).isFile()) {
                        console.log("Path is not a file, please try again.");
                        continue;
                    }

                    // Copy file to data folder
                    await fs.copyFile(absoluteSessionPath, path.join(dataPath, `fbstate_${sessionFileID}.json`));
                    importedSessionFile = true;
                    break;
                }
            }

            // Yes/No question: Do you want to add email/password fallback login?
            // Ask if session file was imported, otherwise force it to true
            let addEmailPasswordFallback = importedSessionFile ? (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to add email/password fallback login? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            })) : true;

            let email: string = "";
            let password: string = "";
            let twoFASecret: string = "";
            if (addEmailPasswordFallback) {
                // Ask for email
                email = (await new Promise<string>((resolve) => {
                    rl.question("Email: ", (answer) => {
                        resolve(answer);
                    });
                })).trim();

                // Ask for password
                password = (await new Promise<string>((resolve) => {
                    rl.question("Password: ", (answer) => {
                        resolve(answer);
                    });
                })).trim();

                // Ask for 2FA secret
                twoFASecret = (await new Promise<string>((resolve) => {
                    rl.question("2FA secret (leave blank if not enabled): ", (answer) => {
                        resolve(answer);
                    });
                })).trim();
            }

            // Add account to accounts array
            accounts.push({
                shortName: "int_facebook",
                loginData: {
                    ...(addEmailPasswordFallback ? {
                        email,
                        password,
                        ...(twoFASecret ? { twoFactorSecret: twoFASecret } : {})
                    } : {}),
                    appstateLocation: `fbstate_${sessionFileID}.json`
                },
                id: 0
            });
        } else {
            // Invalid account type
            console.log("Invalid account type, please try again.");
            continue;
        }

        // Yes/No question: Do you want to add another account?
        let addAnotherAccount = (await new Promise<boolean>(function rec(resolve) {
            rl.question("Do you want to add another account? (y/n): ", (answer) => {
                if (answer.trim().toLowerCase() === "y") {
                    resolve(true);
                } else if (answer.trim().toLowerCase() === "n") {
                    resolve(false);
                } else {
                    console.log("Invalid answer, please try again.");
                    rec(resolve);
                }
            });
        }));

        if (!addAnotherAccount) {
            break;
        }
    }

    // Yes/No question: Do you want to add operators?
    let addOperators = (await new Promise<boolean>(function rec(resolve) {
        rl.question("Do you want to add operators? (y/n): ", (answer) => {
            if (answer.trim().toLowerCase() === "y") {
                resolve(true);
            } else if (answer.trim().toLowerCase() === "n") {
                resolve(false);
            } else {
                console.log("Invalid answer, please try again.");
                rec(resolve);
            }
        });
    }));

    let operators = [];
    if (addOperators) {
        // Show format of account IDs
        console.log("Account IDs are in the format of <accountID>@User@<platform>.");
        console.log("Facebook accounts are in the format of <Facebook User ID>@User@Facebook. (eg: 100009708281975@User@Facebook)");
        console.log("Discord accounts are in the format of <Discord User ID>@User@Discord. (eg: 299105606642696193@User@Discord)");
        console.log("Telegram accounts are in the format of <Telegram User ID>@User@Telegram. (eg: 1644710917@User@Telegram)");
        console.log();
        console.log("Protip: Use bot @userinfobot on Telegram to get your Telegram User ID.");

        for (; ;) {
            // Ask for operator ID
            let operatorID = (await new Promise<string>((resolve) => {
                rl.question("Formatted operator ID: ", (answer) => {
                    resolve(answer);
                });
            })).trim();

            // Add operator to operators array
            operators.push(operatorID);

            // Yes/No question: Do you want to add another operator?
            let addAnotherOperator = (await new Promise<boolean>(function rec(resolve) {
                rl.question("Do you want to add another operator? (y/n): ", (answer) => {
                    if (answer.trim().toLowerCase() === "y") {
                        resolve(true);
                    } else if (answer.trim().toLowerCase() === "n") {
                        resolve(false);
                    } else {
                        console.log("Invalid answer, please try again.");
                        rec(resolve);
                    }
                });
            }));

            if (!addAnotherOperator) {
                break;
            }
        }
    }

    // Add ID in accounts 
    for (let i = 0; i < accounts.length; i++) {
        accounts[i].id = i;
    }

    // Write config file
    await fs.writeFile(path.join(profilePath, "config.json"), JSON.stringify({
        listener: accounts,
        databases: [
            {
                shortName: "db_json",
                id: 1,
                params: {
                    file: "database_default.json"
                }
            }
        ],
        defaultDatabase: 1,
        crashOnDefaultDatabaseFail: true,
        moduleConfig: {
            command_handler: {
                language: "en-US"
            }
        },
        operators
    }));
}

// Test if module is installed or outdated, and install/update if necessary
for (let moduleName in MODULE_TABLE) {
    let modulePath = path.join(profilePath, "modules", moduleName + ".zip");

    if (MODULE_TABLE[moduleName].mode === "git") {
        let zip = new AdmZip(modulePath);
        let installerVersion = zip.readAsText("INSTALLER_VERSION").trim();
        if (installerVersion !== MODULE_TABLE[moduleName].commit) {
            console.log(`[i] Mismatched version on ${moduleName}, updating...`);
            await installModule(profilePath, moduleName, MODULE_TABLE[moduleName]);
        }
    } else {
        console.log(`[?] Unknown module ${moduleName}`);
    }
}

async function installModule(profileURL: string, moduleName: string, moduleMetadata: ModuleMetadata) {
    let tempPath = path.join(os.tmpdir(), "installer_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    console.log(`[i] Installing module ${moduleName}...`);
    switch (moduleMetadata.mode) {
        case "git":
            console.log(`[i] Cloning ${moduleName} from ${moduleMetadata.url} at ${moduleMetadata.commit}...`);
            await Git.clone({
                fs,
                http: GitHTTP,
                dir: tempPath,
                url: moduleMetadata.url,
                ref: moduleMetadata.commit
            });
            console.log("[i] Removing git files...");
            await fs.rmdir(path.join(tempPath, ".git"), { recursive: true });
            console.log("[i] Marking version in module...");
            await fs.writeFile(path.join(tempPath, "INSTALLER_VERSION"), moduleMetadata.commit);
            break;
        default:
            console.log(`[!] Unknown mode ${moduleMetadata.mode} for module ${moduleName}`);
    }

    // Read module.json and determine if it needs compiling.
    let moduleJSON = JSON.parse(await fs.readFile(path.join(tempPath, "module.json"), "utf8"));
    if (moduleJSON.type === "package") {
        // Read package.json and check if there's "build" command.
        let packageJSON = JSON.parse(await fs.readFile(path.join(tempPath, "package.json"), "utf8"));
        if (packageJSON.scripts && packageJSON.scripts.build) {
            // This package needs compiling.
            console.log("[i] Installing dependencies...");
            await exec("npm install", { cwd: tempPath });

            console.log("[i] Compiling...");
            await exec("npm run build", { cwd: tempPath });

            console.log("[i] Removing temporary files...");
            await fs.rmdir(path.join(tempPath, "node_modules"), { recursive: true });
        }
    }

    console.log("[i] Packaging module...");
    let zip = new AdmZip();
    zip.addLocalFolder(tempPath);
    await fs.writeFile(path.join(profileURL, "modules", moduleName + ".zip"), zip.toBuffer());

    console.log("[i] Cleaning up...");
    await fs.rmdir(tempPath, { recursive: true });

    console.log(`[i] Installed module ${moduleName}.`);
}
