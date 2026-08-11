import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EnrollmentPreservationError,
  EnrollmentScanError,
  EnrollmentScanV1Schema,
  RelativeProjectPathSchema,
  projectDigest,
  scanExistingProject,
} from "../src/index.js";

const AUTHORITY = [
  "# Canonical authority",
  "factory-rule: authority.version=1",
  "factory-rule: release.branch=main",
  "",
].join("\n");
const AUTHORITY_DIGEST = `sha256:${createHash("sha256").update(AUTHORITY).digest("hex")}`;

const APP_TARGET_ID = "AAAAAAAAAAAAAAAAAAAAAAAA";
const UNIT_TEST_TARGET_ID = "BBBBBBBBBBBBBBBBBBBBBBBB";
const UI_TEST_TARGET_ID = "CCCCCCCCCCCCCCCCCCCCCCCC";

const COMPLETE_PROJECT_DEFINITION = String.raw`// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {};
	objectVersion = 56;
	objects = {

/* Begin PBXBuildFile section */
		100000000000000000000001 /* App.swift in Sources */ = {isa = PBXBuildFile; fileRef = 200000000000000000000001 /* App.swift */; };
		100000000000000000000002 /* AppTests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 200000000000000000000002 /* AppTests.swift */; };
		100000000000000000000003 /* AppUITests.swift in Sources */ = {isa = PBXBuildFile; fileRef = 200000000000000000000003 /* AppUITests.swift */; };
		100000000000000000000004 /* XCTest.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = 200000000000000000000007 /* XCTest.framework */; };
		100000000000000000000005 /* XCTest.framework in Frameworks */ = {isa = PBXBuildFile; fileRef = 200000000000000000000007 /* XCTest.framework */; };
/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
		300000000000000000000001 /* PBXContainerItemProxy */ = {
			isa = PBXContainerItemProxy;
			containerPortal = 900000000000000000000001 /* Project object */;
			proxyType = 1;
			remoteGlobalIDString = AAAAAAAAAAAAAAAAAAAAAAAA;
			remoteInfo = ExampleApp;
		};
		300000000000000000000002 /* PBXContainerItemProxy */ = {
			isa = PBXContainerItemProxy;
			containerPortal = 900000000000000000000001 /* Project object */;
			proxyType = 1;
			remoteGlobalIDString = AAAAAAAAAAAAAAAAAAAAAAAA;
			remoteInfo = ExampleApp;
		};
/* End PBXContainerItemProxy section */

/* Begin PBXFileReference section */
		200000000000000000000001 /* App.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = App.swift; sourceTree = "<group>"; };
		200000000000000000000002 /* AppTests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppTests.swift; sourceTree = "<group>"; };
		200000000000000000000003 /* AppUITests.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppUITests.swift; sourceTree = "<group>"; };
		200000000000000000000004 /* ExampleApp.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ExampleApp.app; sourceTree = BUILT_PRODUCTS_DIR; };
		200000000000000000000005 /* ExampleAppTests.xctest */ = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ExampleAppTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
		200000000000000000000006 /* ExampleAppUITests.xctest */ = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ExampleAppUITests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
		200000000000000000000007 /* XCTest.framework */ = {isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = XCTest.framework; path = System/Library/Frameworks/XCTest.framework; sourceTree = SDKROOT; };
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		400000000000000000000001 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = ();
			runOnlyForDeploymentPostprocessing = 0;
		};
		400000000000000000000002 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (100000000000000000000004 /* XCTest.framework in Frameworks */);
			runOnlyForDeploymentPostprocessing = 0;
		};
		400000000000000000000003 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (100000000000000000000005 /* XCTest.framework in Frameworks */);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		500000000000000000000001 = {
			isa = PBXGroup;
			children = (
				500000000000000000000002 /* Sources */,
				500000000000000000000003 /* ExampleAppTests */,
				500000000000000000000004 /* ExampleAppUITests */,
				500000000000000000000006 /* Frameworks */,
				500000000000000000000005 /* Products */,
			);
			sourceTree = "<group>";
		};
		500000000000000000000002 /* Sources */ = {
			isa = PBXGroup;
			children = (200000000000000000000001 /* App.swift */);
			path = Sources;
			sourceTree = "<group>";
		};
		500000000000000000000003 /* ExampleAppTests */ = {
			isa = PBXGroup;
			children = (200000000000000000000002 /* AppTests.swift */);
			path = ExampleAppTests;
			sourceTree = "<group>";
		};
		500000000000000000000004 /* ExampleAppUITests */ = {
			isa = PBXGroup;
			children = (200000000000000000000003 /* AppUITests.swift */);
			path = ExampleAppUITests;
			sourceTree = "<group>";
		};
		500000000000000000000005 /* Products */ = {
			isa = PBXGroup;
			children = (
				200000000000000000000004 /* ExampleApp.app */,
				200000000000000000000005 /* ExampleAppTests.xctest */,
				200000000000000000000006 /* ExampleAppUITests.xctest */,
			);
			name = Products;
			sourceTree = "<group>";
		};
		500000000000000000000006 /* Frameworks */ = {
			isa = PBXGroup;
			children = (200000000000000000000007 /* XCTest.framework */);
			name = Frameworks;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		AAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 800000000000000000000002 /* Build configuration list for PBXNativeTarget "ExampleApp" */;
			buildPhases = (
				600000000000000000000001 /* Sources */,
				400000000000000000000001 /* Frameworks */,
				700000000000000000000001 /* Resources */,
			);
			buildRules = ();
			dependencies = ();
			name = ExampleApp;
			productName = ExampleApp;
			productReference = 200000000000000000000004 /* ExampleApp.app */;
			productType = "com.apple.product-type.application";
		};
		BBBBBBBBBBBBBBBBBBBBBBBB /* ExampleAppTests */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 800000000000000000000003 /* Build configuration list for PBXNativeTarget "ExampleAppTests" */;
			buildPhases = (
				600000000000000000000002 /* Sources */,
				400000000000000000000002 /* Frameworks */,
				700000000000000000000002 /* Resources */,
			);
			buildRules = ();
			dependencies = (300000000000000000000003 /* PBXTargetDependency */);
			name = ExampleAppTests;
			productName = ExampleAppTests;
			productReference = 200000000000000000000005 /* ExampleAppTests.xctest */;
			productType = "com.apple.product-type.bundle.unit-test";
		};
		CCCCCCCCCCCCCCCCCCCCCCCC /* ExampleAppUITests */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 800000000000000000000004 /* Build configuration list for PBXNativeTarget "ExampleAppUITests" */;
			buildPhases = (
				600000000000000000000003 /* Sources */,
				400000000000000000000003 /* Frameworks */,
				700000000000000000000003 /* Resources */,
			);
			buildRules = ();
			dependencies = (300000000000000000000004 /* PBXTargetDependency */);
			name = ExampleAppUITests;
			productName = ExampleAppUITests;
			productReference = 200000000000000000000006 /* ExampleAppUITests.xctest */;
			productType = "com.apple.product-type.bundle.ui-testing";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		900000000000000000000001 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 2660;
				LastUpgradeCheck = 2660;
				TargetAttributes = {
					AAAAAAAAAAAAAAAAAAAAAAAA = {
						CreatedOnToolsVersion = 26.0;
					};
					BBBBBBBBBBBBBBBBBBBBBBBB = {
						CreatedOnToolsVersion = 26.0;
						TestTargetID = AAAAAAAAAAAAAAAAAAAAAAAA;
					};
					CCCCCCCCCCCCCCCCCCCCCCCC = {
						CreatedOnToolsVersion = 26.0;
						TestTargetID = AAAAAAAAAAAAAAAAAAAAAAAA;
					};
				};
			};
			buildConfigurationList = 800000000000000000000001 /* Build configuration list for PBXProject "ExampleApp" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (en, Base);
			mainGroup = 500000000000000000000001;
			productRefGroup = 500000000000000000000005 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				AAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */,
				BBBBBBBBBBBBBBBBBBBBBBBB /* ExampleAppTests */,
				CCCCCCCCCCCCCCCCCCCCCCCC /* ExampleAppUITests */,
			);
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		700000000000000000000001 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		700000000000000000000002 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
		700000000000000000000003 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		600000000000000000000001 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (100000000000000000000001 /* App.swift in Sources */); runOnlyForDeploymentPostprocessing = 0; };
		600000000000000000000002 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (100000000000000000000002 /* AppTests.swift in Sources */); runOnlyForDeploymentPostprocessing = 0; };
		600000000000000000000003 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (100000000000000000000003 /* AppUITests.swift in Sources */); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
		300000000000000000000003 /* PBXTargetDependency */ = {isa = PBXTargetDependency; target = AAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */; targetProxy = 300000000000000000000001 /* PBXContainerItemProxy */; };
		300000000000000000000004 /* PBXTargetDependency */ = {isa = PBXTargetDependency; target = AAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */; targetProxy = 300000000000000000000002 /* PBXContainerItemProxy */; };
/* End PBXTargetDependency section */

/* Begin XCBuildConfiguration section */
		810000000000000000000001 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_MODULES = YES; DEBUG_INFORMATION_FORMAT = dwarf; ENABLE_TESTABILITY = YES; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SDKROOT = iphoneos; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; SWIFT_VERSION = 6.0; }; name = Debug; };
		810000000000000000000002 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {ALWAYS_SEARCH_USER_PATHS = NO; CLANG_ENABLE_MODULES = YES; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SDKROOT = iphoneos; SWIFT_COMPILATION_MODE = wholemodule; SWIFT_VERSION = 6.0; VALIDATE_PRODUCT = YES; }; name = Release; };
		810000000000000000000003 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; GENERATE_INFOPLIST_FILE = YES; MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleApp; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
		810000000000000000000004 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; GENERATE_INFOPLIST_FILE = YES; MARKETING_VERSION = 1.0; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleApp; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
		810000000000000000000005 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {BUNDLE_LOADER = "$(TEST_HOST)"; CODE_SIGN_STYLE = Automatic; GENERATE_INFOPLIST_FILE = YES; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleAppTests; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TEST_HOST = "$(BUILT_PRODUCTS_DIR)/ExampleApp.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/ExampleApp"; }; name = Debug; };
		810000000000000000000006 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {BUNDLE_LOADER = "$(TEST_HOST)"; CODE_SIGN_STYLE = Automatic; GENERATE_INFOPLIST_FILE = YES; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleAppTests; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TEST_HOST = "$(BUILT_PRODUCTS_DIR)/ExampleApp.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/ExampleApp"; }; name = Release; };
		810000000000000000000007 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; GENERATE_INFOPLIST_FILE = YES; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleAppUITests; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TEST_TARGET_NAME = ExampleApp; }; name = Debug; };
		810000000000000000000008 /* Release */ = {isa = XCBuildConfiguration; buildSettings = {CODE_SIGN_STYLE = Automatic; GENERATE_INFOPLIST_FILE = YES; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"; PRODUCT_BUNDLE_IDENTIFIER = example.invalid.ExampleAppUITests; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; TEST_TARGET_NAME = ExampleApp; }; name = Release; };
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		800000000000000000000001 /* Build configuration list for PBXProject "ExampleApp" */ = {isa = XCConfigurationList; buildConfigurations = (810000000000000000000001 /* Debug */, 810000000000000000000002 /* Release */); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		800000000000000000000002 /* Build configuration list for PBXNativeTarget "ExampleApp" */ = {isa = XCConfigurationList; buildConfigurations = (810000000000000000000003 /* Debug */, 810000000000000000000004 /* Release */); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		800000000000000000000003 /* Build configuration list for PBXNativeTarget "ExampleAppTests" */ = {isa = XCConfigurationList; buildConfigurations = (810000000000000000000005 /* Debug */, 810000000000000000000006 /* Release */); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
		800000000000000000000004 /* Build configuration list for PBXNativeTarget "ExampleAppUITests" */ = {isa = XCConfigurationList; buildConfigurations = (810000000000000000000007 /* Debug */, 810000000000000000000008 /* Release */); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
/* End XCConfigurationList section */
	};
	rootObject = 900000000000000000000001 /* Project object */;
}
`;

const COMPLETE_SCHEME = String.raw`<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2660" version="1.7">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
        <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AAAAAAAAAAAAAAAAAAAAAAAA" BuildableName="ExampleApp.app" BlueprintName="ExampleApp" ReferencedContainer="container:ExampleApp.xcodeproj"></BuildableReference>
      </BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
    <Testables>
      <TestableReference skipped="NO">
        <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="BBBBBBBBBBBBBBBBBBBBBBBB" BuildableName="ExampleAppTests.xctest" BlueprintName="ExampleAppTests" ReferencedContainer="container:ExampleApp.xcodeproj"></BuildableReference>
      </TestableReference>
      <TestableReference skipped="NO">
        <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="CCCCCCCCCCCCCCCCCCCCCCCC" BuildableName="ExampleAppUITests.xctest" BlueprintName="ExampleAppUITests" ReferencedContainer="container:ExampleApp.xcodeproj"></BuildableReference>
      </TestableReference>
    </Testables>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AAAAAAAAAAAAAAAAAAAAAAAA" BuildableName="ExampleApp.app" BlueprintName="ExampleApp" ReferencedContainer="container:ExampleApp.xcodeproj"></BuildableReference>
    </BuildableProductRunnable>
  </LaunchAction>
  <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES">
    <BuildableProductRunnable runnableDebuggingMode="0">
      <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="AAAAAAAAAAAAAAAAAAAAAAAA" BuildableName="ExampleApp.app" BlueprintName="ExampleApp" ReferencedContainer="container:ExampleApp.xcodeproj"></BuildableReference>
    </BuildableProductRunnable>
  </ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"></AnalyzeAction>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"></ArchiveAction>
</Scheme>
`;

const COMPLETE_WORKSPACE = String.raw`<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "group:ExampleApp.xcodeproj">
   </FileRef>
</Workspace>
`;

const COMPLETE_APP_SOURCE = String.raw`import SwiftUI

struct AppFeature {
    let title = "Example"
}

@main
struct ExampleApp: App {
    var body: some Scene {
        WindowGroup {
            Text(AppFeature().title)
        }
    }
}
`;

const COMPLETE_UNIT_TEST_SOURCE = String.raw`import XCTest
@testable import ExampleApp

final class AppTests: XCTestCase {
    func testFeatureTitle() {
        XCTAssertEqual(AppFeature().title, "Example")
    }
}
`;

const COMPLETE_UI_TEST_SOURCE = String.raw`import XCTest

final class AppUITests: XCTestCase {
    @MainActor
    func testLaunchesExampleApp() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertEqual(app.state, .runningForeground)
    }
}
`;

const COMPLETE_CI_WORKFLOW = String.raw`name: verify
on: [push, pull_request]
jobs:
  test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run iOS tests
        run: >-
          xcodebuild test
          -project ExampleApp.xcodeproj
          -scheme ExampleApp
          -destination 'platform=iOS Simulator,OS=latest,name=iPhone 16 Pro'
          CODE_SIGNING_ALLOWED=NO
`;

function conformingAdapter(additionalRule = ""): string {
  return [
    "# Tool adapter",
    "factory-rule: authority.import=AGENTS.md",
    `factory-rule: authority.digest=${AUTHORITY_DIGEST}`,
    additionalRule,
    "",
  ].join("\n");
}

function git(root: string, ...arguments_: readonly string[]): Buffer {
  const result = spawnSync("git", ["-C", root, ...arguments_], {
    encoding: null,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
    },
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString("utf8"));
  return result.stdout;
}

function write(root: string, path: string, content: string | Buffer): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function initializeRepository(repositoryRoot: string): void {
  git(repositoryRoot, "init", "--quiet");
  git(repositoryRoot, "config", "user.name", "Project SDK Test");
  git(repositoryRoot, "config", "user.email", "project-sdk@example.invalid");
}

function commitAll(repositoryRoot: string, message = "fixture"): void {
  git(repositoryRoot, "add", "-A");
  git(repositoryRoot, "commit", "--quiet", "-m", message);
}

function createCompleteProject(
  overrides: Readonly<Record<string, string>> = {},
): Readonly<{ repositoryRoot: string; sandboxRoot: string }> {
  const sandboxRoot = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-")));
  const repositoryRoot = join(sandboxRoot, "ExampleApp");
  mkdirSync(repositoryRoot);
  const files: Record<string, string> = {
    "AGENTS.md": AUTHORITY,
    "CLAUDE.md": conformingAdapter("factory-rule: release.branch=main"),
    ".cursor/rules/factory.mdc": conformingAdapter("factory-rule: testflight.branch=testflight"),
    "ExampleApp.xcodeproj/project.pbxproj": COMPLETE_PROJECT_DEFINITION,
    "ExampleApp.xcodeproj/xcshareddata/xcschemes/ExampleApp.xcscheme": COMPLETE_SCHEME,
    "ExampleApp.xcworkspace/contents.xcworkspacedata": COMPLETE_WORKSPACE,
    "ExampleApp.xcworkspace/xcshareddata/xcschemes/ExampleWorkspace.xcscheme": COMPLETE_SCHEME,
    "Sources/App.swift": COMPLETE_APP_SOURCE,
    "ExampleAppTests/AppTests.swift": COMPLETE_UNIT_TEST_SOURCE,
    "ExampleAppUITests/AppUITests.swift": COMPLETE_UI_TEST_SOURCE,
    ".github/workflows/verify.yml": COMPLETE_CI_WORKFLOW,
    ".app-factory/project.json": '{"schemaVersion":1,"projectId":"example-app","platform":"ios"}\n',
    ".app-factory/experience-manifest.json": '{"schemaVersion":1,"routes":[],"journeys":[]}\n',
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) write(repositoryRoot, path, content);
  initializeRepository(repositoryRoot);
  commitAll(repositoryRoot);
  return { repositoryRoot: realpathSync(repositoryRoot), sandboxRoot };
}

function createMinimalRepository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-sdk-minimal-")));
  write(root, "AGENTS.md", AUTHORITY);
  initializeRepository(root);
  commitAll(root);
  return root;
}

function porcelain(root: string): Buffer {
  return git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
}

describe("read-only existing-project enrollment", () => {
  it("catalogues only direct PBX objects when TargetAttributes contain multiline ID records", () => {
    const { repositoryRoot } = createCompleteProject();
    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toContainEqual(
      expect.objectContaining({
        kind: "project",
        path: "ExampleApp.xcodeproj",
        applicationTargetIds: [APP_TARGET_ID],
        unitTestTargetIds: [UNIT_TEST_TARGET_ID],
        uiTestTargetIds: [UI_TEST_TARGET_ID],
        validation: { status: "verified", code: null },
      }),
    );
    expect(result.inventory.xcodeSchemes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ExampleApp",
          applicationTargetIds: [APP_TARGET_ID],
          unitTestTargetIds: [UNIT_TEST_TARGET_ID],
          uiTestTargetIds: [UI_TEST_TARGET_ID],
          validation: { status: "verified", code: null },
        }),
        expect.objectContaining({
          name: "ExampleWorkspace",
          applicationTargetIds: [APP_TARGET_ID],
          unitTestTargetIds: [UNIT_TEST_TARGET_ID],
          uiTestTargetIds: [UI_TEST_TARGET_ID],
          validation: { status: "verified", code: null },
        }),
      ]),
    );
    expect(result.readiness).toMatchObject({
      verifiedXcodeContainerCount: 2,
      verifiedSharedSchemeCount: 2,
    });
  });

  it("fails closed when the PBX dictionary braces are unbalanced", () => {
    expect(COMPLETE_PROJECT_DEFINITION.endsWith("}\n")).toBe(true);
    const malformedDefinition = COMPLETE_PROJECT_DEFINITION.slice(0, -2);
    const { repositoryRoot } = createCompleteProject({
      "ExampleApp.xcodeproj/project.pbxproj": malformedDefinition,
    });

    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toContainEqual(
      expect.objectContaining({
        kind: "project",
        validation: { status: "invalid", code: "xcode.definition-unparseable" },
      }),
    );
    expect(result.readiness).toMatchObject({
      ready: false,
      verifiedXcodeContainerCount: 1,
      verifiedSharedSchemeCount: 0,
    });
  });

  it("rejects PBX linkage fields that exist only inside comments or quoted strings", () => {
    const spoofedDefinitions = [
      {
        field: "rootObject",
        original: "\trootObject = 900000000000000000000001 /* Project object */;",
        spoof: '\tcomment = "rootObject = 900000000000000000000001;";',
      },
      {
        field: "isa",
        original: "\t\t\tisa = PBXProject;",
        spoof: '\t\t\tcomment = "isa = PBXProject;";',
      },
      {
        field: "targets",
        original: [
          "\t\t\ttargets = (",
          "\t\t\t\tAAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */,",
          "\t\t\t\tBBBBBBBBBBBBBBBBBBBBBBBB /* ExampleAppTests */,",
          "\t\t\t\tCCCCCCCCCCCCCCCCCCCCCCCC /* ExampleAppUITests */,",
          "\t\t\t);",
        ].join("\n"),
        spoof:
          "\t\t\t/* targets = (AAAAAAAAAAAAAAAAAAAAAAAA, BBBBBBBBBBBBBBBBBBBBBBBB, CCCCCCCCCCCCCCCCCCCCCCCC); */",
      },
      {
        field: "productType",
        original: '\t\t\tproductType = "com.apple.product-type.application";',
        spoof: '\t\t\tcomment = "productType = com.apple.product-type.application;";',
      },
      {
        field: "buildPhases",
        original: [
          "\t\t\tbuildPhases = (",
          "\t\t\t\t600000000000000000000001 /* Sources */,",
          "\t\t\t\t400000000000000000000001 /* Frameworks */,",
          "\t\t\t\t700000000000000000000001 /* Resources */,",
          "\t\t\t);",
        ].join("\n"),
        spoof:
          "\t\t\t/* buildPhases = (600000000000000000000001, 400000000000000000000001, 700000000000000000000001); */",
      },
    ] as const;

    for (const mutation of spoofedDefinitions) {
      const projectDefinition = COMPLETE_PROJECT_DEFINITION.replace(
        mutation.original,
        mutation.spoof,
      );
      expect(projectDefinition, mutation.field).not.toBe(COMPLETE_PROJECT_DEFINITION);
      const { repositoryRoot } = createCompleteProject({
        "ExampleApp.xcodeproj/project.pbxproj": projectDefinition,
      });

      const result = scanExistingProject({ repositoryRoot });
      const project = result.inventory.xcodeContainers.find(
        (container) => container.kind === "project",
      );
      expect(project?.validation.status, mutation.field).toBe("invalid");
      expect(project?.applicationTargetIds, mutation.field).toEqual([]);
      expect(result.readiness.verifiedSharedSchemeCount, mutation.field).toBe(0);
    }
  });

  it("accepts quoted PBX values and comment labels without treating their contents as syntax", () => {
    expect(COMPLETE_PROJECT_DEFINITION).toContain(
      'productType = "com.apple.product-type.application";',
    );
    expect(COMPLETE_PROJECT_DEFINITION).toContain("/* Project object */");
    const { repositoryRoot } = createCompleteProject();

    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toContainEqual(
      expect.objectContaining({
        kind: "project",
        validation: { status: "verified", code: null },
        applicationTargetIds: [APP_TARGET_ID],
      }),
    );
  });

  it("rejects quoted and unquoted duplicate PBX linkage keys", () => {
    const appBuildPhases = [
      "\t\t\tbuildPhases = (",
      "\t\t\t\t600000000000000000000001 /* Sources */ ,",
      "\t\t\t\t400000000000000000000001 /* Frameworks */ ,",
      "\t\t\t\t700000000000000000000001 /* Resources */ ,",
      "\t\t\t);",
    ]
      .join("\n")
      .replaceAll(" */ ,", " */,");
    const projectTargets = [
      "\t\t\ttargets = (",
      "\t\t\t\tAAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */ ,",
      "\t\t\t\tBBBBBBBBBBBBBBBBBBBBBBBB /* ExampleAppTests */ ,",
      "\t\t\t\tCCCCCCCCCCCCCCCCCCCCCCCC /* ExampleAppUITests */ ,",
      "\t\t\t);",
    ]
      .join("\n")
      .replaceAll(" */ ,", " */,");
    const quotedDuplicates = [
      {
        field: "rootObject",
        original: "\trootObject = 900000000000000000000001 /* Project object */;",
        replacement: [
          "\trootObject = 900000000000000000000001 /* Project object */;",
          '\t"rootObject" = AAAAAAAAAAAAAAAAAAAAAAAA;',
        ].join("\n"),
      },
      {
        field: "single-quoted rootObject",
        original: "\trootObject = 900000000000000000000001 /* Project object */;",
        replacement: [
          "\trootObject = 900000000000000000000001 /* Project object */;",
          "\t'rootObject' = AAAAAAAAAAAAAAAAAAAAAAAA;",
        ].join("\n"),
      },
      {
        field: "isa",
        original: "\t\t\tisa = PBXProject;",
        replacement: ["\t\t\tisa = PBXProject;", '\t\t\t"isa" = PBXNativeTarget;'].join("\n"),
      },
      {
        field: "targets",
        original: projectTargets,
        replacement: [projectTargets, '\t\t\t"targets" = ();'].join("\n"),
      },
      {
        field: "productType",
        original: '\t\t\tproductType = "com.apple.product-type.application";',
        replacement: [
          '\t\t\tproductType = "com.apple.product-type.application";',
          '\t\t\t"productType" = "com.apple.product-type.bundle.unit-test";',
        ].join("\n"),
      },
      {
        field: "buildPhases",
        original: appBuildPhases,
        replacement: [appBuildPhases, '\t\t\t"buildPhases" = ();'].join("\n"),
      },
    ] as const;

    for (const mutation of quotedDuplicates) {
      const projectDefinition = COMPLETE_PROJECT_DEFINITION.replace(
        mutation.original,
        mutation.replacement,
      );
      expect(projectDefinition, mutation.field).not.toBe(COMPLETE_PROJECT_DEFINITION);
      const { repositoryRoot } = createCompleteProject({
        "ExampleApp.xcodeproj/project.pbxproj": projectDefinition,
      });

      const result = scanExistingProject({ repositoryRoot });
      const project = result.inventory.xcodeContainers.find(
        (container) => container.kind === "project",
      );
      expect(project?.validation.status, mutation.field).toBe("invalid");
      expect(project?.applicationTargetIds, mutation.field).toEqual([]);
      expect(result.readiness.verifiedSharedSchemeCount, mutation.field).toBe(0);
    }
  });

  it("rejects quoted PBX object identifiers and quoted direct object properties", () => {
    const quotedDefinitions = [
      COMPLETE_PROJECT_DEFINITION.replace(
        "\t\tAAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */ = {",
        '\t\t"AAAAAAAAAAAAAAAAAAAAAAAA" /* ExampleApp */ = {',
      ),
      COMPLETE_PROJECT_DEFINITION.replace(
        "\t\tAAAAAAAAAAAAAAAAAAAAAAAA /* ExampleApp */ = {",
        "\t\t'AAAAAAAAAAAAAAAAAAAAAAAA' /* ExampleApp */ = {",
      ),
      COMPLETE_PROJECT_DEFINITION.replace(
        "\t\t\tisa = PBXNativeTarget;",
        '\t\t\t"isa" = PBXNativeTarget;',
      ),
      COMPLETE_PROJECT_DEFINITION.replace(
        "\t\t\tname = ExampleApp;",
        ["\t\t\tname = ExampleApp;", '\t\t\t"name" = SpoofedApp;'].join("\n"),
      ),
    ];

    for (const projectDefinition of quotedDefinitions) {
      expect(projectDefinition).not.toBe(COMPLETE_PROJECT_DEFINITION);
      const { repositoryRoot } = createCompleteProject({
        "ExampleApp.xcodeproj/project.pbxproj": projectDefinition,
      });
      const result = scanExistingProject({ repositoryRoot });

      expect(result.inventory.xcodeContainers).toContainEqual(
        expect.objectContaining({
          kind: "project",
          applicationTargetIds: [],
          validation: expect.objectContaining({ status: "invalid" }),
        }),
      );
      expect(result.readiness.verifiedSharedSchemeCount).toBe(0);
    }
  });

  it("rejects additional outer dictionaries and meaningful top-level text", () => {
    const invalidDocuments = [
      `${COMPLETE_PROJECT_DEFINITION}\n{}\n`,
      `${COMPLETE_PROJECT_DEFINITION}\ntrailing-junk\n`,
      `leading-junk\n${COMPLETE_PROJECT_DEFINITION}`,
    ];

    for (const projectDefinition of invalidDocuments) {
      const { repositoryRoot } = createCompleteProject({
        "ExampleApp.xcodeproj/project.pbxproj": projectDefinition,
      });
      const result = scanExistingProject({ repositoryRoot });

      expect(result.inventory.xcodeContainers).toContainEqual(
        expect.objectContaining({
          kind: "project",
          validation: { status: "invalid", code: "xcode.definition-unparseable" },
        }),
      );
      expect(result.readiness.verifiedSharedSchemeCount).toBe(0);
    }
  });

  it("traverses legacy opaque direct keys without cataloguing them as canonical object IDs", () => {
    const sectionEnd = "/* End PBXFileReference section */";
    const projectDefinition = COMPLETE_PROJECT_DEFINITION.replace(
      sectionEnd,
      [
        '\t\t2BE28C68-6411-44 /* Legacy file reference */ = {isa = PBXFileReference; path = "Legacy.swift"; sourceTree = "<group>"; };',
        sectionEnd,
      ].join("\n"),
    );
    expect(projectDefinition).not.toBe(COMPLETE_PROJECT_DEFINITION);
    const { repositoryRoot } = createCompleteProject({
      "ExampleApp.xcodeproj/project.pbxproj": projectDefinition,
    });

    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toContainEqual(
      expect.objectContaining({
        kind: "project",
        applicationTargetIds: [APP_TARGET_ID],
        unitTestTargetIds: [UNIT_TEST_TARGET_ID],
        uiTestTargetIds: [UI_TEST_TARGET_ID],
        validation: { status: "verified", code: null },
      }),
    );
    expect(result.readiness).toMatchObject({
      verifiedXcodeContainerCount: 2,
      verifiedSharedSchemeCount: 2,
    });
  });

  it("verifies a complete clean project and emits a stable no-op plan", () => {
    const { repositoryRoot } = createCompleteProject();
    const first = scanExistingProject({ repositoryRoot });
    const second = scanExistingProject({ repositoryRoot });

    expect(EnrollmentScanV1Schema.parse(first)).toEqual(first);
    expect(first.before).toEqual(first.after);
    expect(first.preservation).toEqual({
      headUnchanged: true,
      statusUnchanged: true,
      scanSurfaceUnchanged: true,
      gitAdminUnchanged: true,
    });
    expect(first.inventory.xcodeContainers).toMatchObject([
      {
        kind: "project",
        path: "ExampleApp.xcodeproj",
        applicationTargetIds: [APP_TARGET_ID],
        unitTestTargetIds: [UNIT_TEST_TARGET_ID],
        uiTestTargetIds: [UI_TEST_TARGET_ID],
        validation: { status: "verified", code: null },
      },
      {
        kind: "workspace",
        path: "ExampleApp.xcworkspace",
        validation: { status: "verified", code: null },
      },
    ]);
    expect(first.inventory.xcodeSchemes).toMatchObject([
      {
        name: "ExampleApp",
        containerPath: "ExampleApp.xcodeproj",
        applicationTargetIds: [APP_TARGET_ID],
        unitTestTargetIds: [UNIT_TEST_TARGET_ID],
        uiTestTargetIds: [UI_TEST_TARGET_ID],
        validation: { status: "verified", code: null },
      },
      {
        name: "ExampleWorkspace",
        containerPath: "ExampleApp.xcworkspace",
        applicationTargetIds: [APP_TARGET_ID],
        unitTestTargetIds: [UNIT_TEST_TARGET_ID],
        uiTestTargetIds: [UI_TEST_TARGET_ID],
        validation: { status: "verified", code: null },
      },
    ]);
    expect(first.inventory.swift.verifiedSourcePaths).toEqual(["Sources/App.swift"]);
    expect(first.inventory.swift.verifiedTestSourcePaths).toEqual([
      "ExampleAppTests/AppTests.swift",
    ]);
    expect(first.inventory.swift.verifiedUiTestSourcePaths).toEqual([
      "ExampleAppUITests/AppUITests.swift",
    ]);
    expect(first.inventory.ci).toMatchObject([
      {
        path: ".github/workflows/verify.yml",
        validation: { status: "verified", code: null },
      },
    ]);
    expect(first.issues).toEqual([]);
    expect(first.readiness).toEqual({
      ready: true,
      blockingIssueIds: [],
      gapIssueIds: [],
      verifiedXcodeContainerCount: 2,
      verifiedSharedSchemeCount: 2,
      verifiedSwiftSourceCount: 1,
      verifiedTestSourceCount: 1,
      verifiedUiTestSourceCount: 1,
    });
    expect(first.plan).toMatchObject({
      blocked: false,
      mode: "proposal-only",
      requiresSourceRevalidation: true,
      actions: [],
    });
    expect(first.plan.sourceFingerprint).toBe(projectDigest(first.after));
    expect(second.inventoryDigest).toBe(first.inventoryDigest);
    expect(second.planDigest).toBe(first.planDigest);
  });

  it("uses a private index and preserves source index/config/ref bytes and metadata", () => {
    const { repositoryRoot } = createCompleteProject();
    const gitDirectory = git(
      repositoryRoot,
      "rev-parse",
      "--path-format=absolute",
      "--absolute-git-dir",
    )
      .toString("utf8")
      .trim();
    const indexPath = join(gitDirectory, "index");
    const configPath = join(gitDirectory, "config");
    const headPath = join(gitDirectory, "HEAD");
    const before = [indexPath, configPath, headPath].map((path) => ({
      path,
      bytes: readFileSync(path),
      stats: statSync(path, { bigint: true }),
    }));

    const result = scanExistingProject({ repositoryRoot });

    for (const item of before) {
      const after = statSync(item.path, { bigint: true });
      expect(readFileSync(item.path)).toEqual(item.bytes);
      expect(after.ino).toBe(item.stats.ino);
      expect(after.size).toBe(item.stats.size);
      expect(after.mtimeNs).toBe(item.stats.mtimeNs);
      expect(after.ctimeNs).toBe(item.stats.ctimeNs);
    }
    expect(result.before.gitAdmin).toEqual(result.after.gitAdmin);
    expect(result.before.gitAdmin.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["index", "head", "head-ref", "config", "effective-local-config"]),
    );
  });

  it("resolves and preserves linked-worktree administrative state", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const linkedPath = join(sandboxRoot, "LinkedWorktree");
    git(repositoryRoot, "worktree", "add", "--quiet", "-b", "linked-scan", linkedPath);
    const linkedRoot = realpathSync(linkedPath);

    const result = scanExistingProject({ repositoryRoot: linkedRoot });

    expect(result.before.gitAdmin.kind).toBe("linked-worktree");
    expect(result.before.gitAdmin).toEqual(result.after.gitAdmin);
    expect(result.before.gitAdmin.entries.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["index", "head", "head-ref", "config"]),
    );
    expect(result.readiness.ready).toBe(true);
  });

  it("preserves tracked modifications and untracked files byte-for-byte", () => {
    const { repositoryRoot } = createCompleteProject();
    appendFileSync(join(repositoryRoot, "Sources/App.swift"), "public let dirty = true\n", "utf8");
    write(repositoryRoot, "Notes/untracked.txt", "keep this exact content\n");
    const statusBefore = porcelain(repositoryRoot);
    const result = scanExistingProject({ repositoryRoot });

    expect(result.before.dirty).toBe(true);
    expect(result.before.statusDigest).toBe(result.after.statusDigest);
    expect(result.before.scanSurfaceDigest).toBe(result.after.scanSurfaceDigest);
    expect(porcelain(repositoryRoot)).toEqual(statusBefore);
  });

  it("blocks same-scope rule conflicts but permits a scoped canonical override", () => {
    const conflictProject = createCompleteProject({
      "CLAUDE.md": conformingAdapter("factory-rule: release.branch=release"),
    }).repositoryRoot;
    const conflictScan = scanExistingProject({ repositoryRoot: conflictProject });
    const conflict = conflictScan.issues.find(
      (issue) => issue.code === "rules.conflicting-declaration",
    );
    expect(conflict).toMatchObject({
      severity: "blocker",
      paths: ["AGENTS.md", "CLAUDE.md"],
    });

    const { repositoryRoot } = createCompleteProject();
    const nestedAuthority = [
      "# Feature authority",
      "factory-rule: authority.version=1",
      "factory-rule: release.branch=feature",
      "",
    ].join("\n");
    const nestedDigest = `sha256:${createHash("sha256").update(nestedAuthority).digest("hex")}`;
    write(repositoryRoot, "Features/AGENTS.md", nestedAuthority);
    write(
      repositoryRoot,
      "Features/CLAUDE.md",
      [
        "factory-rule: authority.import=Features/AGENTS.md",
        `factory-rule: authority.digest=${nestedDigest}`,
        "",
      ].join("\n"),
    );
    commitAll(repositoryRoot, "add scoped authority");
    const scoped = scanExistingProject({ repositoryRoot });
    expect(scoped.issues.some((issue) => issue.code === "rules.conflicting-declaration")).toBe(
      false,
    );
    expect(
      scoped.inventory.effectiveRules.find(
        (rule) => rule.scopePath === "Features" && rule.key === "release.branch",
      ),
    ).toMatchObject({ value: "feature", conflict: false, sourcePaths: ["Features/AGENTS.md"] });
  });

  it("does not call a zero-declaration adapter conforming", () => {
    const { repositoryRoot } = createCompleteProject({ "CLAUDE.md": "# prose only\n" });
    const result = scanExistingProject({ repositoryRoot });
    expect(
      result.inventory.ruleFiles.find((file) => file.path === "CLAUDE.md")?.authority.status,
    ).toBe("nonconforming");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "rules.adapter-nonconforming", severity: "blocker" }),
    );
  });

  it("resolves chained links and detects links through excluded directories", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const outsidePath = join(sandboxRoot, "outside.swift");
    writeFileSync(outsidePath, "let outside = true\n", "utf8");
    mkdirSync(join(repositoryRoot, "node_modules"));
    symlinkSync(outsidePath, join(repositoryRoot, "node_modules", "bridge"));
    symlinkSync("node_modules/bridge", join(repositoryRoot, "ViaExcluded.swift"));
    git(repositoryRoot, "add", "-f", "node_modules/bridge", "ViaExcluded.swift");
    git(repositoryRoot, "commit", "--quiet", "-m", "add chained links");

    const result = scanExistingProject({ repositoryRoot });
    expect(result.inventory.symbolicLinkPaths).toEqual([
      "ViaExcluded.swift",
      "node_modules/bridge",
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "safety.symlink-path-escape",
          severity: "blocker",
          paths: ["ViaExcluded.swift"],
        }),
        expect.objectContaining({
          code: "safety.symlink-through-exclusion",
          severity: "blocker",
          paths: ["ViaExcluded.swift"],
        }),
      ]),
    );
  });

  it("rejects oversized, sparse, and over-populated scan surfaces before hashing", () => {
    const oversized = createMinimalRepository();
    write(oversized, "large.bin", Buffer.alloc(2_048, 1));
    expect(() =>
      scanExistingProject({
        repositoryRoot: oversized,
        maxSingleFileBytes: 1_024,
        maxScannedFileBytes: 4_096,
      }),
    ).toThrow(/per-file scan limit/u);

    const sparse = createMinimalRepository();
    write(sparse, "sparse.bin", "");
    truncateSync(join(sparse, "sparse.bin"), 64 * 1024);
    expect(() => scanExistingProject({ repositoryRoot: sparse })).toThrow(/sparse files/u);

    const crowded = createMinimalRepository();
    for (let index = 0; index < 6; index += 1) write(crowded, `Many/${String(index)}.txt`, "x");
    expect(() => scanExistingProject({ repositoryRoot: crowded, maxScanEntries: 5 })).toThrow(
      /directory exceeds safe entry limit/u,
    );
  });

  it("detects the legacy factory contract and proposes adoption instead of a parallel layout", () => {
    const { repositoryRoot } = createCompleteProject();
    unlinkSync(join(repositoryRoot, ".app-factory", "project.json"));
    unlinkSync(join(repositoryRoot, ".app-factory", "experience-manifest.json"));
    write(repositoryRoot, ".factory/project-context.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, ".factory/standard-lock.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, ".factory/AGENTS.factory.md", conformingAdapter());
    write(repositoryRoot, "quality/release-contract.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, "quality/quality-manifest.json", '{"schemaVersion":1}\n');
    write(repositoryRoot, "quality/evidence/manifest.json", '{"schemaVersion":1}\n');
    commitAll(repositoryRoot, "install legacy factory contract");

    const result = scanExistingProject({ repositoryRoot });
    expect(result.inventory.legacyFactoryArtifacts.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "project-context",
        "standard-lock",
        "rule-authority",
        "quality-contract",
        "quality-manifest",
        "quality-evidence",
      ]),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "compatibility.legacy-factory-layout",
        severity: "blocker",
      }),
    );
    expect(result.plan.actions).toContainEqual(
      expect.objectContaining({ kind: "adopt-or-migrate-legacy-layout" }),
    );
    expect(result.plan.actions.map((action) => action.kind)).not.toContain("declare-project");
    expect(result.plan.actions.map((action) => action.kind)).not.toContain("declare-experience");
  });

  it("inventories malformed filenames without treating them as verified readiness", () => {
    const { repositoryRoot } = createCompleteProject({
      "ExampleApp.xcodeproj/project.pbxproj": "",
      "ExampleApp.xcodeproj/xcshareddata/xcschemes/ExampleApp.xcscheme":
        '<!DOCTYPE Scheme [<!ENTITY external SYSTEM "file:///etc/passwd">]><Scheme>&external;</Scheme>',
      "ExampleApp.xcworkspace/contents.xcworkspacedata": "",
      "ExampleApp.xcworkspace/xcshareddata/xcschemes/ExampleWorkspace.xcscheme": "",
      "Sources/App.swift": "",
      "ExampleAppTests/AppTests.swift": "",
      "ExampleAppUITests/AppUITests.swift": "",
      ".github/workflows/verify.yml": "",
      ".app-factory/project.json": "{}",
      ".app-factory/experience-manifest.json": "not-json",
    });
    const result = scanExistingProject({ repositoryRoot });

    expect(result.inventory.xcodeContainers).toHaveLength(2);
    expect(
      result.inventory.xcodeContainers.every((item) => item.validation.status === "invalid"),
    ).toBe(true);
    expect(result.inventory.swift.sourcePaths).toEqual(["Sources/App.swift"]);
    expect(result.inventory.swift.verifiedSourcePaths).toEqual([]);
    expect(result.readiness).toMatchObject({
      ready: false,
      verifiedXcodeContainerCount: 0,
      verifiedSharedSchemeCount: 0,
      verifiedSwiftSourceCount: 0,
      verifiedTestSourceCount: 0,
      verifiedUiTestSourceCount: 0,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ios.no-xcode-container",
        "ios.no-shared-scheme",
        "swift.no-source",
        "quality.no-tests",
        "quality.no-ui-tests",
        "automation.no-ci",
        "factory.invalid-project-manifest",
        "factory.invalid-experience-manifest",
      ]),
    );
  });

  it("fails closed when HEAD changes between discovery and final quiescence", () => {
    const { repositoryRoot } = createCompleteProject();
    expect(() =>
      scanExistingProject({
        repositoryRoot,
        quiescenceCheckpoint: () => {
          git(repositoryRoot, "commit", "--quiet", "--allow-empty", "-m", "concurrent mutation");
        },
      }),
    ).toThrow(EnrollmentPreservationError);
  });

  it("rejects a symlinked repository root and traversal-shaped contract paths", () => {
    const { repositoryRoot, sandboxRoot } = createCompleteProject();
    const linkedRoot = join(sandboxRoot, "linked-repository");
    symlinkSync(repositoryRoot, linkedRoot);
    expect(() => scanExistingProject({ repositoryRoot: linkedRoot })).toThrow(EnrollmentScanError);
    expect(RelativeProjectPathSchema.safeParse("../outside.swift").success).toBe(false);
    expect(RelativeProjectPathSchema.safeParse("nested/../../outside.swift").success).toBe(false);
    expect(RelativeProjectPathSchema.safeParse("/outside.swift").success).toBe(false);
  });
});
