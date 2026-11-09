# frozen_string_literal: true

module ContextDrop
  module Base64Util
    module_function

    def strict_encode64(bin)
      [bin.to_s.b].pack("m0")
    end

    def strict_decode64(str)
      str.to_s.unpack1("m0")
    end
  end
end
