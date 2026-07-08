//
//  DCC — DOM element references
//

var elements = {
  shortcutLinks: Array.from(document.querySelectorAll(".shortcut-link[data-action]")),
  cardTemplate: document.getElementById("cardTemplate"),
  clock: document.getElementById("clock"),
  pomodoroBtn: document.getElementById("pomodoroBtn"),
  pomodoroTime: document.getElementById("pomodoroTime"),
  pomodoroModal: document.getElementById("pomodoroModal"),
  pomodoroModalBackdrop: document.getElementById("pomodoroModalBackdrop"),
  pomodoroModalPanel: document.getElementById("pomodoroModalPanel"),
  pomodoroModalPhase: document.getElementById("pomodoroModalPhase"),
  pomodoroModalTime: document.getElementById("pomodoroModalTime"),
  pomodoroModalSessions: document.getElementById("pomodoroModalSessions"),
  pomodoroModalHint: document.getElementById("pomodoroModalHint"),
  contextPicker: document.getElementById("contextPicker"),
  contextPickerTitle: document.getElementById("contextPickerTitle"),
  contextPickerOptions: document.getElementById("contextPickerOptions"),
  contextPickerRefresh: document.getElementById("contextPickerRefresh"),
  contextPickerAge: document.getElementById("contextPickerAge"),
  contextPickerBackdrop: document.getElementById("contextPickerBackdrop"),
  tooltip: document.getElementById("dccTooltip"),
  tooltipText: document.getElementById("dccTooltipText"),
  incidentBadge: document.getElementById("incidentBadge"),
  incidentCount: document.getElementById("incidentCount"),
  oncallIndicator: document.getElementById("oncallIndicator"),
  oncallName: document.getElementById("oncallName"),
  pills: {
    aws: document.getElementById("awsPill"),
    kubernetes: document.getElementById("k8sPill"),
    git: document.getElementById("gitPill"),
    vpn: document.getElementById("vpnPill")
  }
};
