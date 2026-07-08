import Cocoa
import Foundation

let APP_NAME = "MCC"
let PROJECT_DIR = URL(fileURLWithPath: CommandLine.arguments[0])
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .path
let CONFIG_DIR = NSHomeDirectory() + "/.dcc"
let CONFIG_FILE = CONFIG_DIR + "/config.json"

struct Config: Codable {
    var port: Int = 8721
    var pollMs: Int = 30000
    var focusMs: Int = 3000
    var verbose: Bool = false
    var tlsRequired: Bool = true
    var devMode: Bool = false
}

var config = Config()
var serverProcess: Process?
var agentProcess: Process?

func loadConfig() {
    let fm = FileManager.default
    if !fm.fileExists(atPath: CONFIG_DIR) {
        try? fm.createDirectory(atPath: CONFIG_DIR, withIntermediateDirectories: true)
    }
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: CONFIG_FILE)) else {
        saveConfig()
        return
    }
    if let c = try? JSONDecoder().decode(Config.self, from: data) {
        config = c
    }
}

func saveConfig() {
    guard let data = try? JSONEncoder().encode(config) else { return }
    try? data.write(to: URL(fileURLWithPath: CONFIG_FILE))
}

func writeEnvFile() {
    var lines = [
        "DCC_PORT=\(config.port)",
        "DCC_POLL_MS=\(config.pollMs)",
        "DCC_FOCUS_MS=\(config.focusMs)",
        "DCC_TLS_REQUIRED=\(config.tlsRequired ? 1 : 0)",
        "DCC_DEV=\(config.devMode ? 1 : 0)",
        "DCC_VERBOSE=\(config.verbose ? 1 : 0)"
    ]
    // preserve existing env vars from .env
    if let existing = try? String(contentsOfFile: PROJECT_DIR + "/.env", encoding: .utf8) {
        for line in existing.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
            let parts = trimmed.components(separatedBy: "=")
            if parts.count < 2 { continue }
            let key = parts[0].trimmingCharacters(in: .whitespaces)
            if ["DCC_PORT", "DCC_POLL_MS", "DCC_FOCUS_MS", "DCC_TLS_REQUIRED", "DCC_DEV", "DCC_VERBOSE"].contains(key) { continue }
            lines.append(trimmed)
        }
    }
    try? lines.joined(separator: "\n").write(toFile: PROJECT_DIR + "/.env", atomically: true, encoding: .utf8)
}

func isServerRunning() -> Bool {
    let task = Process()
    task.launchPath = "/bin/bash"
    task.arguments = ["-c", "pgrep -f 'node server\\.js' | head -1"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.launch()
    task.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    return (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count > 0
}

func nodePath() -> String {
    // try common paths, fall back to env
    let paths = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
    for p in paths {
        if FileManager.default.fileExists(atPath: p) { return p }
    }
    // try which
    let task = Process()
    task.launchPath = "/usr/bin/env"
    task.arguments = ["which", "node"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.launch()
    task.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let found = (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if !found.isEmpty && FileManager.default.fileExists(atPath: found) { return found }
    return "/opt/homebrew/bin/node"
}

func startServer() {
    stopServer()
    writeEnvFile()
    let node = nodePath()
    let logPath = "/tmp/dcc-server.log"
    // truncate log
    try? "".write(toFile: logPath, atomically: true, encoding: .utf8)

    let task = Process()
    task.launchPath = node
    task.currentDirectoryPath = PROJECT_DIR
    task.arguments = ["server.js"]
    if let fh = FileHandle(forWritingAtPath: logPath) {
        task.standardOutput = fh
        task.standardError = fh
    }
    try? task.run()
    serverProcess = task

    let agent = Process()
    agent.launchPath = node
    agent.currentDirectoryPath = PROJECT_DIR
    agent.arguments = ["agent/index.js"]
    if let fh = FileHandle(forWritingAtPath: logPath) {
        agent.standardOutput = fh
        agent.standardError = fh
    }
    try? agent.run()
    agentProcess = agent
}

func stopServer() {
    serverProcess?.terminate()
    agentProcess?.terminate()
    serverProcess = nil
    agentProcess = nil
    // kill any remaining node processes for this project
    let task = Process()
    task.launchPath = "/usr/bin/pkill"
    task.arguments = ["-f", "node server\\.js"]
    try? task.run()
    task.waitUntilExit()
    let task2 = Process()
    task2.launchPath = "/usr/bin/pkill"
    task2.arguments = ["-f", "node agent/index\\.js"]
    try? task2.run()
    task2.waitUntilExit()
}

func getLocalIP() -> String {
    let task = Process()
    task.launchPath = "/usr/sbin/ipconfig"
    task.arguments = ["getifaddr", "en0"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.launch()
    task.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    return (String(data: data, encoding: .utf8) ?? "localhost").trimmingCharacters(in: .whitespacesAndNewlines)
}

func promptForInt(_ msg: String, current: Int, callback: @escaping (Int) -> Void) {
    let alert = NSAlert()
    alert.messageText = msg
    alert.informativeText = "Current: \(current)"
    alert.addButton(withTitle: "Save")
    alert.addButton(withTitle: "Cancel")
    let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 200, height: 24))
    input.stringValue = String(current)
    alert.accessoryView = input
    alert.window.initialFirstResponder = input
    if alert.runModal() == .alertFirstButtonReturn {
        if let val = Int(input.stringValue), val > 0 {
            callback(val)
        }
    }
}

func promptForBool(_ msg: String, current: Bool, callback: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.messageText = msg
    alert.informativeText = "Current: \(current ? "Yes" : "No")"
    alert.addButton(withTitle: "Yes")
    alert.addButton(withTitle: "No")
    alert.addButton(withTitle: "Cancel")
    let result = alert.runModal()
    if result == .alertFirstButtonReturn { callback(true) }
    else if result == .alertSecondButtonReturn { callback(false) }
}

// MARK: - App

var appDelegate: AppDelegate!

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var menu: NSMenu!
    var statusMenuItem: NSMenuItem!
    var toggleMenuItem: NSMenuItem!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        loadConfig()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "⚙"
            button.font = NSFont.systemFont(ofSize: 14)
        }
        buildMenu()
        // auto-start server after a brief delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            if !isServerRunning() {
                startServer()
                self?.updateStatusMenuItem()
            }
        }
        // update status every 10s
        Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.updateStatusMenuItem()
        }
    }

    func buildMenu() {
        menu = NSMenu()
        menu.minimumWidth = 220

        statusMenuItem = NSMenuItem(title: "Server: checking...", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        toggleMenuItem = NSMenuItem(title: "Start Server", action: #selector(toggleServer), keyEquivalent: "")
        toggleMenuItem.target = self
        menu.addItem(toggleMenuItem)

        menu.addItem(NSMenuItem.separator())

        let ipItem = NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "d")
        ipItem.target = self
        menu.addItem(ipItem)

        menu.addItem(NSMenuItem.separator())

        let portItem = NSMenuItem(title: "Port: \(config.port)", action: #selector(changePort), keyEquivalent: "")
        portItem.target = self
        menu.addItem(portItem)

        let pollItem = NSMenuItem(title: "Poll: \(config.pollMs)ms", action: #selector(changePoll), keyEquivalent: "")
        pollItem.target = self
        menu.addItem(pollItem)

        let focusItem = NSMenuItem(title: "Focus: \(config.focusMs)ms", action: #selector(changeFocus), keyEquivalent: "")
        focusItem.target = self
        menu.addItem(focusItem)

        let verboseItem = NSMenuItem(title: "Verbose: \(config.verbose ? "On" : "Off")", action: #selector(toggleVerbose), keyEquivalent: "")
        verboseItem.target = self
        menu.addItem(verboseItem)

        let tlsItem = NSMenuItem(title: "TLS: \(config.tlsRequired ? "On" : "Off")", action: #selector(toggleTLS), keyEquivalent: "")
        tlsItem.target = self
        menu.addItem(tlsItem)

        let devItem = NSMenuItem(title: "Dev Mode: \(config.devMode ? "On" : "Off")", action: #selector(toggleDev), keyEquivalent: "")
        devItem.target = self
        menu.addItem(devItem)

        menu.addItem(NSMenuItem.separator())

        menu.addItem(NSMenuItem.separator())

        let logsItem = NSMenuItem(title: "View Logs", action: #selector(viewLogs), keyEquivalent: "l")
        logsItem.target = self
        menu.addItem(logsItem)

        menu.addItem(NSMenuItem(title: "Quit MCC", action: #selector(quitApp), keyEquivalent: "q"))

        statusItem.menu = menu
        updateStatusMenuItem()
    }

    func rebuildMenu() {
        statusItem.menu = nil
        buildMenu()
    }

    @objc func updateStatusMenuItem() {
        let running = isServerRunning()
        statusMenuItem.title = "Server: \(running ? "● Online" : "○ Offline")"
        statusMenuItem.attributedTitle = nil
        toggleMenuItem.title = running ? "Stop Server" : "Start Server"
    }

    @objc func toggleServer() {
        if isServerRunning() {
            stopServer()
        } else {
            startServer()
        }
        updateStatusMenuItem()
    }

    @objc func openDashboard() {
        let ip = getLocalIP()
        let proto = FileManager.default.fileExists(atPath: "\(PROJECT_DIR)/certs/dcc-local.key") ? "https" : "http"
        let url = URL(string: "\(proto)://\(ip):\(config.port)")!
        NSWorkspace.shared.open(url)
    }

    @objc func changePort() {
        promptForInt("Server Port", current: config.port) { val in
            config.port = val
            saveConfig()
            appDelegate.rebuildMenu()
            if isServerRunning() {
                let alert = NSAlert()
                alert.messageText = "Port changed"
                alert.informativeText = "Restart the server for changes to take effect."
                alert.runModal()
            }
        }
    }

    @objc func changePoll() {
        promptForInt("Poll Interval (ms)", current: config.pollMs) { val in
            config.pollMs = val
            saveConfig()
            appDelegate.rebuildMenu()
            if isServerRunning() {
                let alert = NSAlert()
                alert.messageText = "Poll interval changed"
                alert.informativeText = "Restart the server for changes to take effect."
                alert.runModal()
            }
        }
    }

    @objc func changeFocus() {
        promptForInt("Focus Poll Interval (ms)", current: config.focusMs) { val in
            config.focusMs = val
            saveConfig()
            appDelegate.rebuildMenu()
        }
    }

    @objc func toggleVerbose() {
        config.verbose.toggle()
        saveConfig()
        rebuildMenu()
    }

    @objc func toggleTLS() {
        config.tlsRequired.toggle()
        saveConfig()
        rebuildMenu()
    }

    @objc func toggleDev() {
        config.devMode.toggle()
        saveConfig()
        rebuildMenu()
    }

    @objc func quitApp() {
        stopServer()
        NSApplication.shared.terminate(nil)
    }

    @objc func viewLogs() {
        let logPath = "/tmp/dcc-server.log"
        if !FileManager.default.fileExists(atPath: logPath) {
            let alert = NSAlert()
            alert.messageText = "No logs yet"
            alert.informativeText = "Start the server first to generate logs."
            alert.runModal()
            return
        }
        NSWorkspace.shared.open(URL(fileURLWithPath: logPath))
    }
}

let app = NSApplication.shared
appDelegate = AppDelegate()
app.delegate = appDelegate
app.setActivationPolicy(.accessory)
app.run()
