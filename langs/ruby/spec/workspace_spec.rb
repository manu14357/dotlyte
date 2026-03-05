# frozen_string_literal: true

require "dotlyte"
require "tmpdir"
require "json"
require "fileutils"

RSpec.describe Dotlyte::Workspace do
  describe ".find_monorepo_root" do
    it "detects pnpm workspace" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "pnpm-workspace.yaml"), <<~YAML)
          packages:
            - "packages/*"
        YAML
        FileUtils.mkdir_p(File.join(dir, "packages", "api"))
        FileUtils.mkdir_p(File.join(dir, "packages", "web"))

        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).not_to be_nil
        expect(info.type).to eq(:pnpm)
        expect(info.root).to eq(dir)
        expect(info.packages.size).to eq(2)
      end
    end

    it "detects turbo workspace" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "turbo.json"), "{}")
        File.write(File.join(dir, "package.json"), JSON.generate({ "workspaces" => ["packages/*"] }))
        FileUtils.mkdir_p(File.join(dir, "packages", "core"))

        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).not_to be_nil
        expect(info.type).to eq(:turbo)
      end
    end

    it "detects nx workspace" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "nx.json"), "{}")
        File.write(File.join(dir, "package.json"), JSON.generate({ "workspaces" => ["apps/*"] }))
        FileUtils.mkdir_p(File.join(dir, "apps", "frontend"))

        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).not_to be_nil
        expect(info.type).to eq(:nx)
      end
    end

    it "detects lerna workspace" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "lerna.json"), JSON.generate({ "packages" => ["packages/*"] }))
        FileUtils.mkdir_p(File.join(dir, "packages", "lib"))

        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).not_to be_nil
        expect(info.type).to eq(:lerna)
        expect(info.packages).to include(File.join(dir, "packages", "lib"))
      end
    end

    it "detects npm/yarn workspaces from package.json" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "package.json"), JSON.generate({ "workspaces" => ["packages/*"] }))
        FileUtils.mkdir_p(File.join(dir, "packages", "utils"))

        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).not_to be_nil
        expect(info.type).to eq(:npm)
      end
    end

    it "walks up directories to find the root" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n")
        sub = File.join(dir, "packages", "deep", "nested")
        FileUtils.mkdir_p(sub)

        info = described_class.find_monorepo_root(cwd: sub)
        expect(info).not_to be_nil
        expect(info.root).to eq(dir)
      end
    end

    it "returns nil when no monorepo is found" do
      Dir.mktmpdir do |dir|
        info = described_class.find_monorepo_root(cwd: dir)
        expect(info).to be_nil
      end
    end
  end

  describe ".get_shared_env" do
    it "loads shared .env from root" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, ".env"), <<~ENV)
          APP_NAME=my-app
          PORT=3000
        ENV

        result = described_class.get_shared_env(dir)
        expect(result["app_name"]).to eq("my-app")
        expect(result["port"]).to eq(3000)
      end
    end

    it "strips prefix from keys" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, ".env"), <<~ENV)
          MYAPP_DB_HOST=localhost
          MYAPP_DB_PORT=5432
        ENV

        result = described_class.get_shared_env(dir, prefix: "MYAPP")
        expect(result["db_host"]).to eq("localhost")
        expect(result["db_port"]).to eq(5432)
      end
    end

    it "returns empty hash when no .env file exists" do
      Dir.mktmpdir do |dir|
        result = described_class.get_shared_env(dir)
        expect(result).to eq({})
      end
    end

    it "ignores comments and blank lines" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, ".env"), <<~ENV)
          # This is a comment
          KEY=value

          # Another comment
        ENV

        result = described_class.get_shared_env(dir)
        expect(result.size).to eq(1)
        expect(result["key"]).to eq("value")
      end
    end
  end

  describe ".load_workspace" do
    it "raises error when root cannot be detected" do
      Dir.mktmpdir do |dir|
        expect {
          described_class.load_workspace(root: nil, packages: nil)
        }.to raise_error(Dotlyte::Error, /Could not detect monorepo root/)
      end
    end

    it "loads workspace with explicit root and packages" do
      Dir.mktmpdir do |dir|
        pkg_dir = File.join(dir, "packages", "api")
        FileUtils.mkdir_p(pkg_dir)
        File.write(File.join(dir, ".env"), "SHARED=true\n")
        File.write(File.join(pkg_dir, ".env"), "API_PORT=4000\n")

        results = described_class.load_workspace(
          root: dir,
          packages: ["packages/api"]
        )
        expect(results).to have_key("api")
        expect(results["api"]).to be_a(Dotlyte::Config)
      end
    end
  end

  describe "MonorepoInfo" do
    it "is a Struct with root, type, packages" do
      info = described_class::MonorepoInfo.new(root: "/tmp", type: :pnpm, packages: [])
      expect(info.root).to eq("/tmp")
      expect(info.type).to eq(:pnpm)
      expect(info.packages).to eq([])
    end
  end
end
