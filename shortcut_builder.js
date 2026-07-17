// Builds a valid unsigned iOS Shortcut (.shortcut) XML plist for AURA.
// The shortcut fetches /api/shortcuts/audit, bumps volume to 100% and speaks
// the result via Siri (uk-UA). User imports it once; iOS 15+ prompts to allow.

const crypto = require('crypto');

function uuid() {
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = b.toString('hex').toUpperCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {string} auditUrl full HTTPS URL to /api/shortcuts/audit
 * @param {string} openUrl  full HTTPS URL to the PWA root
 */
function buildAuraShortcut(auditUrl, openUrl) {
    const downloadUUID = uuid();
    const speakUUID = uuid();
    const setVolumeUUID = uuid();
    const openUUID = uuid();
    // ￼ = the "object replacement" glyph iOS Shortcuts uses to represent an inline variable reference.
    const OBJ = '￼';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>WFWorkflowClientVersion</key>
    <string>2607.0.2</string>
    <key>WFWorkflowClientRelease</key>
    <string>6.1</string>
    <key>WFWorkflowMinimumClientVersion</key>
    <integer>900</integer>
    <key>WFWorkflowMinimumClientVersionString</key>
    <string>900</string>
    <key>WFWorkflowIcon</key>
    <dict>
        <key>WFWorkflowIconStartColor</key>
        <integer>-38037</integer>
        <key>WFWorkflowIconGlyphNumber</key>
        <integer>59511</integer>
    </dict>
    <key>WFWorkflowImportQuestions</key>
    <array/>
    <key>WFWorkflowTypes</key>
    <array>
        <string>NCWidget</string>
        <string>WatchKit</string>
    </array>
    <key>WFWorkflowInputContentItemClasses</key>
    <array>
        <string>WFAppStoreAppContentItem</string>
        <string>WFArticleContentItem</string>
        <string>WFContactContentItem</string>
        <string>WFDateContentItem</string>
        <string>WFEmailAddressContentItem</string>
        <string>WFGenericFileContentItem</string>
        <string>WFImageContentItem</string>
        <string>WFiTunesProductContentItem</string>
        <string>WFLocationContentItem</string>
        <string>WFDCMapsLinkContentItem</string>
        <string>WFAVAssetContentItem</string>
        <string>WFPDFContentItem</string>
        <string>WFPhoneNumberContentItem</string>
        <string>WFRichTextContentItem</string>
        <string>WFSafariWebPageContentItem</string>
        <string>WFStringContentItem</string>
        <string>WFURLContentItem</string>
    </array>
    <key>WFWorkflowActions</key>
    <array>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.setvolume</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>UUID</key>
                <string>${setVolumeUUID}</string>
                <key>WFVolume</key>
                <real>1</real>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.downloadurl</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>UUID</key>
                <string>${downloadUUID}</string>
                <key>Advanced</key>
                <true/>
                <key>Headers</key>
                <dict>
                    <key>Value</key>
                    <dict>
                        <key>WFDictionaryFieldValueItems</key>
                        <array/>
                    </dict>
                    <key>WFSerializationType</key>
                    <string>WFDictionaryFieldValue</string>
                </dict>
                <key>Method</key>
                <string>GET</string>
                <key>WFHTTPBodyType</key>
                <string>JSON</string>
                <key>WFURL</key>
                <string>${esc(auditUrl)}</string>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.speaktext</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>UUID</key>
                <string>${speakUUID}</string>
                <key>WFSpeakTextRate</key>
                <real>0.5</real>
                <key>WFSpeakTextPitch</key>
                <real>1</real>
                <key>WFSpeakTextLanguage</key>
                <string>uk-UA</string>
                <key>WFSpeakTextWaitUntilFinished</key>
                <true/>
                <key>WFText</key>
                <dict>
                    <key>Value</key>
                    <dict>
                        <key>string</key>
                        <string>${OBJ}</string>
                        <key>attachmentsByRange</key>
                        <dict>
                            <key>{0, 1}</key>
                            <dict>
                                <key>Type</key>
                                <string>ActionOutput</string>
                                <key>OutputName</key>
                                <string>Contents of URL</string>
                                <key>OutputUUID</key>
                                <string>${downloadUUID}</string>
                            </dict>
                        </dict>
                    </dict>
                    <key>WFSerializationType</key>
                    <string>WFTextTokenString</string>
                </dict>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.openurl</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>UUID</key>
                <string>${openUUID}</string>
                <key>WFInput</key>
                <dict>
                    <key>Value</key>
                    <dict>
                        <key>string</key>
                        <string>${esc(openUrl)}</string>
                    </dict>
                    <key>WFSerializationType</key>
                    <string>WFTextTokenString</string>
                </dict>
            </dict>
        </dict>
    </array>
</dict>
</plist>
`;
}

module.exports = { buildAuraShortcut };
