import cliPath from "@nocom_bot/cli";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createInterface } from "node:readline";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import * as Git from "isomorphic-git";
import GitHTTP from 'isomorphic-git/http/node/index.js';
import { Command, Option } from "commander";
import { exec as execCB, fork } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execCB);

type SourceMetadata = {
    mode: "git",
    url: string,
    commit: string
};

const KERNEL: SourceMetadata = {
    mode: "git",
    url: "https://github.com/NOCOM-BOT/core.git",
    commit: "d5bbd9433e5d2f81532e5530d142090959272bb9"
}

const MODULE_TABLE: {
    [x: string]: SourceMetadata
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
        commit: "f40da5f8df5ecbe03443083ab6415d9584b3acbb"
    },
    mod_database_json: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_database_json.git",
        commit: "11765c5cd865af8e9ba62d749d6d79f37d54a594"
    },
    mod_pluginhandler_a: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_pluginhandler_a.git",
        commit: "276d91d4755feb698a6fce9fc6de478ea5d7801e"
    },
    mod_command_handler: {
        mode: "git",
        url: "https://github.com/NOCOM-BOT/mod_command_handler.git",
        commit: "9e3df08dcf313f38ba529481aea0b0e118e246d7"
    }
}

const PLUGIN_TABLE: {
    [x: string]: SourceMetadata
} = {
    C3CBotInternal: {
        mode: "git",
        url: "https://github.com/c3cbot/c3cbot_internal_plugin.git",
        commit: "5ab931718ff8d64fc0aefa30b02cff8d1e7dade0"
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

// Create kernel directory if it doesn't exist
const kernelPath = path.join(profilePath, "kernel");
if (!fsSync.existsSync(kernelPath)) {
    await fs.mkdir(kernelPath);
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
                shortName: "int_fbmsg_legacy",
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

    console.log("Added account!");
    console.log();

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

    if (fsSync.existsSync(modulePath)) {
        if (MODULE_TABLE[moduleName].mode === "git") {
            let zip = new AdmZip(modulePath);
            let installerVersion = zip.readAsText("INSTALLER_VERSION").trim();
            if (installerVersion !== MODULE_TABLE[moduleName].commit) {
                console.log(`[i] Mismatched version on module ${moduleName}, updating...`);
                await installModule(profilePath, moduleName, MODULE_TABLE[moduleName]);
            }
        } else {
            console.log(`[?] Unknown module ${moduleName}`);
        }
    } else {
        console.log(`[i] Module ${moduleName} not installed, installing...`);
        await installModule(profilePath, moduleName, MODULE_TABLE[moduleName]);
    }
}

// Test if plugin is installed or outdated, and install/update if necessary
for (let pluginName in PLUGIN_TABLE) {
    let pluginPath = path.join(profilePath, "plugins", pluginName + ".zip");

    if (fsSync.existsSync(pluginPath)) {
        if (PLUGIN_TABLE[pluginName].mode === "git") {
            let zip = new AdmZip(pluginPath);
            let installerVersion = zip.readAsText("INSTALLER_VERSION").trim();
            if (installerVersion !== PLUGIN_TABLE[pluginName].commit) {
                console.log(`[i] Mismatched version on plugin ${pluginName}, updating...`);
                await installPlugin(profilePath, pluginName, PLUGIN_TABLE[pluginName]);
            }
        } else {
            console.log(`[?] Unknown plugin ${pluginName}`);
        }
    } else {
        console.log(`[i] Plugin ${pluginName} not installed, installing...`);
        await installPlugin(profilePath, pluginName, PLUGIN_TABLE[pluginName]);
    }
}

// Test if kernel is installed or outdated, and install/update if necessary
switch (KERNEL.mode) {
    case "git":
        try {
            // Read from <profile>/kernel/INSTALLER_VERSION
            let kernelVersion = (await fs.readFile(path.join(kernelPath, "INSTALLER_VERSION"))).toString().trim();
            if (kernelVersion !== KERNEL.commit) {
                console.log("[i] Mismatched version on kernel, updating...");
                await installKernel(profilePath, KERNEL);
            }
        } catch {
            console.log("[i] Kernel not found, installing...");
            await installKernel(profilePath, KERNEL);
        }
        break;
    default:
        console.log(`[?] Unknown kernel source mode ${KERNEL.mode}, halting...`);
        process.exit(1);
}

async function installKernel(profileURL: string, kernelMetadata: SourceMetadata) {
    // Install kernel directly to <profile>/kernel
    let kernelPath = path.join(profileURL, "kernel");
    switch (kernelMetadata.mode) {
        case "git":
            console.log(`[i] Cloning kernel from ${kernelMetadata.url} at ${kernelMetadata.commit}...`);
            await Git.clone({
                fs: fsSync,
                http: GitHTTP,
                dir: kernelPath,
                url: kernelMetadata.url,
                ref: kernelMetadata.commit
            });
            console.log("[i] Removing git files...");
            await fs.rm(path.join(kernelPath, ".git"), { recursive: true });
            console.log("[i] Marking version in module...");
            await fs.writeFile(path.join(kernelPath, "INSTALLER_VERSION"), kernelMetadata.commit);
            break;
        default:
            console.log(`[?] Unknown kernel source mode ${kernelMetadata.mode}, halting...`);
            process.exit(1);
    }

    console.log("[i] Installing kernel dependencies...");
    await exec("npm install", { cwd: kernelPath });

    console.log("[i] Building kernel...");
    await exec("npm run build", { cwd: kernelPath });

    console.log("[i] Kernel installed successfully!");
    console.log();
}

async function installModule(profileURL: string, moduleName: string, moduleMetadata: SourceMetadata) {
    let tempPath = path.join(profileURL, "temp", "installer_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    console.log(`[i] Installing module ${moduleName}...`);
    await fs.mkdir(tempPath);
    switch (moduleMetadata.mode) {
        case "git":
            console.log(`[i] Cloning ${moduleName} from ${moduleMetadata.url} at ${moduleMetadata.commit}...`);
            await Git.clone({
                fs: fsSync,
                http: GitHTTP,
                dir: tempPath,
                url: moduleMetadata.url,
                ref: moduleMetadata.commit
            });
            console.log("[i] Removing git files...");
            await fs.rm(path.join(tempPath, ".git"), { recursive: true });
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
            await fs.rm(path.join(tempPath, "node_modules"), { recursive: true });
        }
    }

    console.log("[i] Packaging module...");
    let zip = new AdmZip();
    zip.addLocalFolder(tempPath);
    await fs.writeFile(path.join(profileURL, "modules", moduleName + ".zip"), zip.toBuffer());

    console.log("[i] Cleaning up...");
    await fs.rm(tempPath, { recursive: true });

    console.log(`[i] Installed module ${moduleName}.`);
    console.log();
}

async function installPlugin(profileURL: string, pluginName: string, pluginMetadata: SourceMetadata) {
    let tempPath = path.join(profileURL, "temp", "installer_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    console.log(`[i] Installing plugin ${pluginName}...`);
    await fs.mkdir(tempPath);
    switch (pluginMetadata.mode) {
        case "git":
            console.log(`[i] Cloning ${pluginName} from ${pluginMetadata.url} at ${pluginMetadata.commit}...`);
            await Git.clone({
                fs: fsSync,
                http: GitHTTP,
                dir: tempPath,
                url: pluginMetadata.url,
                ref: pluginMetadata.commit
            });
            console.log("[i] Removing git files...");
            await fs.rm(path.join(tempPath, ".git"), { recursive: true });
            console.log("[i] Marking version in plugin...");
            await fs.writeFile(path.join(tempPath, "INSTALLER_VERSION"), pluginMetadata.commit);
            break;
        default:
            console.log(`[!] Unknown mode ${pluginMetadata.mode} for plugin ${pluginName}`);
    }

    console.log("[i] Packaging plugin...");
    let zip = new AdmZip();
    zip.addLocalFolder(tempPath);
    await fs.writeFile(path.join(profileURL, "plugins", pluginName + ".zip"), zip.toBuffer());

    console.log("[i] Cleaning up...");
    await fs.rm(tempPath, { recursive: true });

    console.log(`[i] Installed plugin ${pluginName}.`);
    console.log();
}

// Call CLI and start the bot.
console.log("[i] Starting C3CBot...");
console.log();
let cliProcess = fork(cliPath, ["-k", kernelPath, "-l", opts.logLevel, "-g", opts.logLevel, "-u", profilePath], {
    stdio: "inherit"
});

cliProcess.on("exit", (code) => {
    process.exit(code ?? 0);
});
