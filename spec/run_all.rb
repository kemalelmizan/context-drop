# frozen_string_literal: true

require_relative "spec_helper"

# Lightweight RSpec-compatible DSL runner for zero-dependency test execution
module MiniRSpec
  class ExpectationFailed < StandardError; end

  class Matcher
    def initialize(type, expected = nil)
      @type = type
      @expected = expected
    end

    def matches?(actual)
      case @type
      when :eq then actual == @expected
      when :be_nil then actual.nil?
      when :be_truthy then !!actual
      when :be_falsy then !actual
      when :include
        if actual.is_a?(Hash) && @expected.is_a?(Hash)
          @expected.all? { |k, v| actual[k] == v }
        elsif actual.respond_to?(:include?)
          actual.include?(@expected)
        else
          false
        end
      when :be_a then actual.is_a?(@expected)
      end
    end

    def description
      "#{@type} #{@expected.inspect}"
    end
  end

  class RaiseErrorMatcher
    def initialize(err_class = StandardError, msg_matcher = nil)
      @err_class = err_class
      @msg_matcher = msg_matcher
    end

    def matches_block?(proc_obj)
      raised = nil
      begin
        proc_obj.call
      rescue StandardError => e
        raised = e
      end
      if raised.nil?
        raise ExpectationFailed, "Expected #{@err_class} to be raised, but nothing was raised"
      end
      unless raised.is_a?(@err_class)
        raise ExpectationFailed, "Expected #{@err_class}, but got #{raised.class}: #{raised.message}"
      end
      if @msg_matcher
        matched = if @msg_matcher.is_a?(Regexp)
                    @msg_matcher.match?(raised.message)
                  else
                    raised.message.include?(@msg_matcher.to_s)
                  end
        unless matched
          raise ExpectationFailed, "Expected error message #{raised.message.inspect} to match #{@msg_matcher.inspect}"
        end
      end
      true
    end
  end

  class BlockTarget
    def initialize(proc_obj)
      @proc = proc_obj
    end

    def to(matcher)
      matcher.matches_block?(@proc)
    end

    def to_raise_error(err_class = StandardError, msg_substring = nil)
      RaiseErrorMatcher.new(err_class, msg_substring).matches_block?(@proc)
    end
  end

  class ValueTarget
    def initialize(actual)
      @actual = actual
    end

    def to(matcher)
      return true if matcher.matches?(@actual)

      raise ExpectationFailed, "Expected #{@actual.inspect} to #{matcher.description}"
    end

    def not_to(matcher)
      return true unless matcher.matches?(@actual)

      raise ExpectationFailed, "Expected #{@actual.inspect} NOT to #{matcher.description}"
    end
  end

  class ExampleGroup
    attr_reader :name, :parent

    def initialize(name, parent = nil)
      @name = name
      @parent = parent
      @before_hooks = []
      @let_definitions = {}
      @examples = []
      @children = []
    end

    def describe(desc, &block)
      child = ExampleGroup.new(desc, self)
      child.instance_eval(&block)
      @children << child
    end
    alias context describe

    def before(&block)
      @before_hooks << block
    end

    def let(name, &block)
      @let_definitions[name.to_sym] = block
    end

    def it(desc, &block)
      @examples << [desc, block]
    end

    def all_before_hooks
      (parent ? parent.all_before_hooks : []) + @before_hooks
    end

    def all_let_definitions
      (parent ? parent.all_let_definitions : {}).merge(@let_definitions)
    end

    def full_name
      parent ? "#{parent.full_name} > #{name}" : name.to_s
    end

    def run(stats)
      @examples.each do |desc, block|
        ctx = ExampleContext.new(all_let_definitions)
        begin
          all_before_hooks.each { |h| ctx.instance_eval(&h) }
          ctx.instance_eval(&block)
          stats[:passed] += 1
          print "."
        rescue StandardError => e
          stats[:failed] += 1
          stats[:failures] << ["#{full_name} — #{desc}", e]
          print "F"
        end
      end
      @children.each { |c| c.run(stats) }
    end
  end

  class ExampleContext
    def initialize(let_defs = {})
      @let_defs = let_defs
      @let_memo = {}
    end

    def method_missing(name, *args, &block)
      sym = name.to_sym
      if @let_defs.key?(sym) && args.empty? && block.nil?
        return @let_memo[sym] if @let_memo.key?(sym)

        @let_memo[sym] = instance_eval(&@let_defs[sym])
      else
        super
      end
    end

    def respond_to_missing?(name, include_private = false)
      @let_defs.key?(name.to_sym) || super
    end

    def expect(val = nil, &block)
      block ? BlockTarget.new(block) : ValueTarget.new(val)
    end

    def eq(expected) = Matcher.new(:eq, expected)
    def be_nil = Matcher.new(:be_nil)
    def be_truthy = Matcher.new(:be_truthy)
    def be_falsy = Matcher.new(:be_falsy)
    def include(expected) = Matcher.new(:include, expected)
    def be_a(expected) = Matcher.new(:be_a, expected)
    def raise_error(expected_class = StandardError, msg_matcher = nil) = RaiseErrorMatcher.new(expected_class, msg_matcher)
  end

  def self.groups
    @groups ||= []
  end

  def self.describe(name, &block)
    group = ExampleGroup.new(name)
    group.instance_eval(&block)
    groups << group
  end
end

unless defined?(RSpec)
  RSpec = MiniRSpec
end

Dir[File.expand_path("context_drop/*_spec.rb", __dir__)].sort.each do |spec_file|
  require spec_file
end

stats = { passed: 0, failed: 0, failures: [] }
MiniRSpec.groups.each { |g| g.run(stats) }
puts "\n\nFinished Ruby specs: #{stats[:passed]} passed, #{stats[:failed]} failed."

if stats[:failed].positive?
  stats[:failures].each_with_index do |(label, err), idx|
    puts "\n#{idx + 1}) #{label}"
    puts "   #{err.class}: #{err.message}"
    puts "   #{err.backtrace.first(5).join("\n   ")}"
  end
  exit 1
end
